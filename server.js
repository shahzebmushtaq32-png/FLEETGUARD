import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import pg from 'pg';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

// --- CONFIGURATION ---
const PORT = process.env.PORT || 10000;

// SECURITY KEYS
const WS_API_KEY = process.env.WS_API_KEY || "BDO_SECURE_NODE_99122"; 
const JWT_SECRET = process.env.JWT_SECRET || "8c22a07b5ae723637fb9b41cdc81a47521c02e0fcdb1bcdfb8ee81e90a13d2eabf0765efe0c5b0ec65bd4b25feaf1fa3377fbfe72c8006dbae4974a52d34b4cc";

// --- DATABASE CONFIGURATION ---
const getDbUrl = () => {
  // 1. Try Environment Variable
  let url = process.env.NEON_DATABASE_URL;
  
  // 2. STRICT CHECK: No Fallbacks allowed. 
  if (!url) {
    console.error("❌ CRITICAL ERROR: NEON_DATABASE_URL environment variable is missing.");
    console.error("Please add NEON_DATABASE_URL to your Render Environment Variables.");
    process.exit(1); // Crash if no DB
  }
  
  // 3. Clean up 'psql' command artifacts if present
  if (url && url.startsWith("psql '")) {
    url = url.replace("psql '", "").replace(/'$/, "");
  }

  if (url && url.includes("channel_binding=require")) {
    url = url.replace("channel_binding=require", "");
  }

  return url.replace(/&+/g, '&').replace(/\?&/g, '?').replace(/[?&]$/, '');
};

const dbUrl = getDbUrl();

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

// --- STORAGE CONFIGURATION (R2) ---
const getR2Endpoint = () => {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT.trim();
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) return undefined; // Return undefined if no R2 config
  return `https://${accountId}.r2.cloudflarestorage.com`;
};

// Initialize R2 conditionally
let r2;
if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
    r2 = new S3Client({
      region: 'auto',
      endpoint: getR2Endpoint(),
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
} else {
    console.warn("⚠️ Cloudflare R2 credentials missing. File uploads will fail.");
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// --- MIDDLEWARE ---
const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey || apiKey !== WS_API_KEY) {
    return res.status(401).json({ error: 'Gateway Unauthorized: Invalid API Key' });
  }
  next();
};

const authenticateToken = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (apiKey !== WS_API_KEY) {
    return res.status(401).json({ error: 'Gateway Unauthorized' });
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Session Unauthorized: Token Missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Session Forbidden: Invalid Token' });
    req.user = user;
    next();
  });
};

const requireRole = (allowedRoles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'User context missing' });
    if (req.user.role === 'Admin') return next();
    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden: Insufficient Permissions' });
    }
    next();
};

// --- DB INIT ---
const initDB = async (retries = 3, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log("✅ NeonDB Connection: Active");
      
      // Updated Schema to support Native App Metadata
      await pool.query(`
        CREATE TABLE IF NOT EXISTS officers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'Account Executive',
          avatar TEXT,
          status TEXT DEFAULT 'Offline',
          battery INTEGER DEFAULT 100,
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          telemetry_source TEXT DEFAULT 'WEB',
          app_version TEXT
        );
      `);
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS location_history (
          id SERIAL PRIMARY KEY,
          node_id TEXT REFERENCES officers(id),
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          battery INTEGER,
          status TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const checkAdmin = await pool.query("SELECT * FROM officers WHERE id = 'admin'");
      if (checkAdmin.rowCount === 0) {
           await pool.query(`
            INSERT INTO officers (id, name, password, role, status)
            VALUES ('admin', 'System Administrator', 'admin12', 'Admin', 'Active')
          `);
          console.log("✅ Admin account seeded.");
      }
      
      return;
    } catch (err) {
      console.error(`⚠️ Database init error (Attempt ${i + 1}): ${err.message}`);
      if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
    }
  }
};

initDB();

// --- ROUTES ---

app.get('/', (req, res) => res.status(200).send('FleetGuard Realtime Server Active'));
app.get('/health', (req, res) => res.status(200).send('FleetGuard Online'));

app.post('/api/login', requireApiKey, async (req, res) => {
  const { id, password } = req.body;
  const cleanId = id ? id.trim() : '';
  const cleanPass = password ? password.trim() : '';
  
  try {
    const result = await pool.query('SELECT * FROM officers WHERE id = $1', [cleanId]);
    const user = result.rows[0];

    if (!user || user.password !== cleanPass) {
      console.warn(`❌ Login Failed for ${cleanId}: Invalid Credentials`);
      return res.status(401).json({ error: 'Invalid Credentials' });
    }

    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });

    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role, avatar: user.avatar }
    });
  } catch (err) {
    console.error("❌ Login Error:", err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/officers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM officers ORDER BY name ASC');
    const officers = result.rows.map(o => ({
      ...o,
      lastUpdate: o.last_update,
      telemetrySource: o.telemetry_source || 'WEB', // Map DB snake_case to JS camelCase
      appVersion: o.app_version,
      networkType: '5G', 
      leads: [], history: [], evidence: [], tasks: []
    }));
    res.json(officers);
  } catch (err) {
    console.error("DB Fetch Error:", err);
    res.status(500).json({ error: 'Database Fetch Error' });
  }
});

app.post('/api/officers', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const { id, name, password, role, avatar } = req.body;
  try {
    await pool.query(
      'INSERT INTO officers (id, name, password, role, avatar) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
      [id, name, password, role, avatar]
    );
    const newOfficer = { id, name, role, avatar, status: 'Offline' };
    broadcast({ type: 'ROSTER_UPDATE', payload: newOfficer });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add officer' });
  }
});

app.delete('/api/officers/:id', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    await pool.query('DELETE FROM officers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete officer' });
  }
});

app.get('/api/history/:nodeId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT lat, lng, timestamp FROM location_history WHERE node_id = $1 ORDER BY timestamp DESC LIMIT 100',
      [req.params.nodeId]
    );
    res.json(result.rows.reverse());
  } catch (err) {
    res.status(500).json({ error: 'History Fetch Error' });
  }
});

app.post('/api/upload-proxy', authenticateToken, async (req, res) => {
  const { fileName, fileData } = req.body;
  if (!r2) return res.status(503).json({ error: "Storage Service Unavailable" });
  
  const key = `evidence/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const bucketName = process.env.R2_BUCKET_NAME || 'bdo-fleet-assets';
  
  try {
    const buffer = Buffer.from(fileData.replace(/^data:image\/\w+;base64,/, ""), 'base64');
    
    await r2.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg'
    }));
    
    const url = await getSignedUrl(r2, new GetObjectCommand({
      Bucket: bucketName, 
      Key: key
    }), { expiresIn: 604800 }); 

    res.json({ publicUrl: url });
  } catch (err) {
    console.error("R2 Upload Failed:", err);
    res.status(500).json({ error: 'Storage Upload Failed' });
  }
});

// --- WEBSOCKET SERVER & BATCH PROCESSING ---
const broadcast = (msg) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.clientType === 'dashboard') {
      client.send(JSON.stringify(msg));
    }
  });
};

// WRITE BUFFER: Holds updates in memory
const WRITE_BUFFER = {
    updates: new Map(), // Key: OfficerID, Value: Data
    history: []         // Array of history items
};

// BATCH FLUSH: Writes to DB every 10 seconds
setInterval(async () => {
    if (WRITE_BUFFER.updates.size === 0 && WRITE_BUFFER.history.length === 0) return;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Bulk Update Current Status
        if (WRITE_BUFFER.updates.size > 0) {
            const updates = Array.from(WRITE_BUFFER.updates.values());
            for (const u of updates) {
                // Now updates telemetry_source and app_version columns too
                await client.query(
                    `UPDATE officers SET lat=$1, lng=$2, battery=$3, status=$4, last_update=NOW(), telemetry_source=$5, app_version=$6 WHERE id=$7`,
                    [u.lat, u.lng, u.battery, u.status, u.telemetrySource || 'WEB', u.appVersion || '1.0.0', u.id]
                );
            }
            console.log(`[DB] Flushed ${updates.length} status updates`);
            WRITE_BUFFER.updates.clear();
        }

        // 2. Bulk Insert History
        if (WRITE_BUFFER.history.length > 0) {
            // Processing in chunks to be safe
            const batch = WRITE_BUFFER.history.splice(0, 50); // Take 50 items at a time
            for (const h of batch) {
                await client.query(
                  'INSERT INTO location_history (node_id, lat, lng, battery, status) VALUES ($1, $2, $3, $4, $5)',
                  [h.id, h.lat, h.lng, h.battery, h.status]
                );
            }
            console.log(`[DB] Flushed ${batch.length} history records`);
        }

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("[DB] Batch Write Failed:", e.message);
    } finally {
        client.release();
    }
}, 10000); // 10 Seconds Interval

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const clientKey = url.searchParams.get('key');
  
  if (clientKey !== WS_API_KEY) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  ws.clientType = url.searchParams.get('type') || 'iot';
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'TELEMETRY') {
        const { id, lat, lng, battery, status, telemetrySource, appVersion } = data.payload;

        // 1. Broadcast IMMEDIATELY to Dashboards (Real-time Feel)
        broadcast([data.payload]);

        // 2. Buffer for DB Write (Protect Free Tier)
        // Only update current status map (overwrites previous update from same user in this window)
        WRITE_BUFFER.updates.set(id, { id, lat, lng, battery, status, telemetrySource, appVersion });
        
        // Push to history buffer (Log every point)
        if (lat && lng) {
             WRITE_BUFFER.history.push({ id, lat, lng, battery, status });
        }
      }
    } catch (e) {
      console.error('Socket Message Error:', e);
    }
  });
});

const interval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

server.listen(PORT, () => {
    console.log(`🚀 FleetGuard Server running on port ${PORT}`);
});