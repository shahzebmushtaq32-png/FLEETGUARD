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
// Using fallbacks provided for "BDO Mobile" deployment stability
const WS_API_KEY = process.env.WS_API_KEY || "BDO_SECURE_NODE_99122"; 
const JWT_SECRET = process.env.JWT_SECRET || "8c22a07b5ae723637fb9b41cdc81a47521c02e0fcdb1bcdfb8ee81e90a13d2eabf0765efe0c5b0ec65bd4b25feaf1fa3377fbfe72c8006dbae4974a52d34b4cc";

// --- DATABASE CONFIGURATION ---
const getDbUrl = () => {
  // 1. Try Environment Variable
  let url = process.env.NEON_DATABASE_URL;
  
  // 2. STRICT CHECK: No Fallbacks allowed for DB Connection
  if (!url) {
    throw new Error("❌ CRITICAL ERROR: NEON_DATABASE_URL environment variable is required. Connection blocked.");
  }
  
  // 3. Clean up 'psql' command artifacts if present
  if (url && url.startsWith("psql '")) {
    url = url.replace("psql '", "").replace(/'$/, ""); // Remove start and trailing quote
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
  connectionTimeoutMillis: 10000 // Increased timeout for initial connection
});

// --- STORAGE CONFIGURATION (R2) ---
const getR2Endpoint = () => {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT.trim();
  const accountId = process.env.R2_ACCOUNT_ID || "225bfea5d72cd356fb8697c55d29254c";
  return `https://${accountId}.r2.cloudflarestorage.com`;
};

const r2Config = {
  region: 'auto',
  endpoint: getR2Endpoint(),
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'b8a044d9823caf1e27850bcc6806f057',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'fd3e97181324351cec47f3fc27274aa3da02d320714a4745fbc608906887dd48',
  },
};

// Always initialize R2 with fallbacks
const r2 = new S3Client(r2Config);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- LOGGING MIDDLEWARE ---
app.use((req, res, next) => {
  console.log(`[API Request] ${req.method} ${req.url}`);
  next();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// --- MIDDLEWARE ---

const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey || apiKey !== WS_API_KEY) {
    console.warn(`[Security] Blocked unauthorized gateway access from ${req.ip}. Received: ${apiKey}, Expected: ${WS_API_KEY}`);
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

// --- DB INIT WITH RETRY (NEON COLD START HANDLING) ---
const initDB = async (retries = 5, delay = 2000) => {
  // Check performed in getDbUrl, if we are here, dbUrl is valid string
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log("✅ Database Connection: Active");
      
      // 1. Create Tables
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
          last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // 2. Schema Migration & Constraints
      await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Offline'`);
      await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS battery INTEGER DEFAULT 100`);
      await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
      await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
      await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
      await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS avatar TEXT`);

      try {
        await pool.query(`ALTER TABLE officers ADD PRIMARY KEY (id)`);
      } catch (e) { 
        // Ignore "multiple primary keys" error
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS location_history (
          id SERIAL PRIMARY KEY,
          node_id TEXT REFERENCES officers(id),
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 3. Seed Admin Data (Wrap in try/catch to avoid crash on schema mismatch)
      try {
        const seedResult = await pool.query(`
          INSERT INTO officers (id, name, password, role, status)
          VALUES 
          ('admin', 'Administrator', 'admin12', 'Admin', 'Active'),
          ('n1', 'James Wilson', '12345', 'Senior BDO', 'Offline')
          ON CONFLICT (id) DO UPDATE SET 
            password = EXCLUDED.password,
            role = EXCLUDED.role;
        `);
        console.log(`✅ Database: Schema Synced. Admin Seed Result: ${seedResult.rowCount} rows affected.`);
      } catch (seedErr) {
        console.error("⚠️ Seed Failed (likely schema mismatch, please run manual migration):", seedErr.message);
      }
      
      return; // Success
    } catch (err) {
      console.error(`⚠️ Database init error (Attempt ${i + 1}/${retries}): ${err.message}`);
      if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
    }
  }
  console.error("❌ Database Init Failed after multiple retries.");
};

initDB();

// --- ROUTES ---

app.get('/', (req, res) => res.status(200).send('FleetGuard Realtime Server Active'));
app.get('/health', (req, res) => res.status(200).send('FleetGuard Online'));

app.post('/api/login', requireApiKey, async (req, res) => {
  const { id, password } = req.body;
  const cleanId = id ? id.trim() : '';
  const cleanPass = password ? password.trim() : '';
  
  // 1. STRICT Admin Fallback (Bypasses DB password check for reliability)
  if (cleanId === 'admin' && cleanPass === 'admin12') {
    console.log("🔑 Using Hardcoded Admin Login");
    const token = jwt.sign({ id: 'admin', role: 'Admin', name: 'Administrator' }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token, user: { id: 'admin', name: 'Administrator', role: 'Admin', avatar: null } });
  }

  // 2. STRICT Demo User Fallback (Bypasses DB password check for reliability)
  if (cleanId === 'n1' && cleanPass === '12345') {
    console.log("🔑 Using Hardcoded Demo Login");
    const token = jwt.sign({ id: 'n1', role: 'Senior BDO', name: 'James Wilson' }, JWT_SECRET, { expiresIn: '12h' });
    
    // Attempt to enrich with DB data if available, but don't fail auth
    let userData = { id: 'n1', name: 'James Wilson', role: 'Senior BDO', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-1.2.1&auto=format&fit=crop&w=150&q=80' };
    
    try {
        const result = await pool.query('SELECT * FROM officers WHERE id = $1', ['n1']);
        if (result.rows.length > 0) {
            userData = { ...userData, ...result.rows[0] };
        }
    } catch (e) {
        // Ignore DB fetch error for fallback user
    }
    
    return res.json({ token, user: userData });
  }

  // 3. Standard DB Login
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
    console.error("❌ Login Error (DB):", err.message);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.get('/api/officers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM officers');
    const officers = result.rows.map(o => ({
      ...o,
      lastUpdate: o.last_update,
      networkType: '5G', 
      leads: [], history: [], evidence: [], tasks: []
    }));
    res.json(officers);
  } catch (err) {
    console.error("Fetch Officers Error:", err.message);
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
    console.error("Add Officer Error:", err);
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
  if (!fileName || !fileData) return res.status(400).json({ error: "Missing data" });

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
    res.status(500).json({ error: 'Storage Upload Failed', details: err.message });
  }
});

// --- WEBSOCKET SERVER ---

const broadcast = (msg) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.clientType === 'dashboard') {
      client.send(JSON.stringify(msg));
    }
  });
};

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const clientKey = url.searchParams.get('key');
  
  // Use safe key check
  const validKey = WS_API_KEY;
  
  if (clientKey !== validKey) {
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
        const { id, lat, lng, battery, status } = data.payload;
        
        if (pool) {
            try {
                await pool.query(
                `UPDATE officers SET lat=$1, lng=$2, battery=$3, status=$4, last_update=NOW() WHERE id=$5`,
                [lat, lng, battery, status, id]
                );
                await pool.query(
                'INSERT INTO location_history (node_id, lat, lng) VALUES ($1, $2, $3)',
                [id, lat, lng]
                );
            } catch (dbErr) {
                console.error("DB Write Error (Telemetry):", dbErr.message);
            }
        }
        broadcast([data.payload]);
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

// --- CATCH-ALL 404 ---
app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.url}` });
});

// --- STARTUP ---
server.listen(PORT, () => {
    console.log(`🚀 FleetGuard Server running on port ${PORT}`);
    console.log(`✅ Database Configured (Strict Mode)`);
});