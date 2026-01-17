
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
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // Run once every 24 hours

// SECURITY KEYS
const WS_API_KEY = process.env.WS_API_KEY || "BDO_SECURE_NODE_99122"; 
const JWT_SECRET = process.env.JWT_SECRET || "8c22a07b5ae723637fb9b41cdc81a47521c02e0fcdb1bcdfb8ee81e90a13d2eabf0765efe0c5b0ec65bd4b25feaf1fa3377fbfe72c8006dbae4974a52d34b4cc";

// --- DATABASE CONFIGURATION ---
const getDbUrl = () => {
  let url = process.env.NEON_DATABASE_URL;
  if (!url) {
    console.error("❌ CRITICAL ERROR: NEON_DATABASE_URL environment variable is missing.");
    process.exit(1); 
  }
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

// --- DATA CLEANUP LOGIC (MONTHLY PURGE) ---
const cleanupOldData = async () => {
  console.log("🕒 Starting Data Lifecycle Cleanup (Target: >30 Days)...");
  try {
    const result = await pool.query(`
      DELETE FROM location_history 
      WHERE timestamp < NOW() - INTERVAL '30 days'
    `);
    console.log(`✅ Cleanup Complete. Purged ${result.rowCount} legacy telemetry records.`);
  } catch (err) {
    console.error("❌ Cleanup Failed:", err.message);
  }
};

// --- STORAGE CONFIGURATION (R2) ---
const getR2Endpoint = () => {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT.trim();
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) return undefined; 
  return `https://${accountId}.r2.cloudflarestorage.com`;
};

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

// --- DB INIT ---
const initDB = async (retries = 3, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log("✅ NeonDB Connection: Active");
      
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
          node_id TEXT REFERENCES officers(id) ON DELETE CASCADE,
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          battery INTEGER,
          status TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Initial cleanup on boot
      await cleanupOldData();
      // Schedule recurring cleanup
      setInterval(cleanupOldData, CLEANUP_INTERVAL);
      
      return;
    } catch (err) {
      console.error(`⚠️ Database init error (Attempt ${i + 1}): ${err.message}`);
      if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
    }
  }
};

initDB();

// --- ROUTES ---
app.get('/health', (req, res) => res.status(200).send('FleetGuard Online'));

app.post('/api/maintenance/cleanup', requireApiKey, async (req, res) => {
  await cleanupOldData();
  res.json({ success: true, message: "Manual monthly cleanup triggered." });
});

app.get('/api/neon-stats', requireApiKey, async (req, res) => {
  try {
    const officersCount = await pool.query('SELECT COUNT(*) FROM officers');
    const historyCount = await pool.query('SELECT COUNT(*) FROM location_history');
    res.json({
      status: 'CONNECTED',
      provider: 'Neon.tech',
      activeNodes: parseInt(officersCount.rows[0].count),
      telemetryPoints: parseInt(historyCount.rows[0].count),
      pool: {
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingRequests: pool.waitingCount
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

app.post('/api/login', requireApiKey, async (req, res) => {
  const { id, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM officers WHERE id = $1', [id]);
    const user = result.rows[0];
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid Credentials' });
    }
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role, avatar: user.avatar }
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/officers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM officers ORDER BY name ASC');
    res.json(result.rows.map(o => ({ ...o, lastUpdate: o.last_update, leads: [], history: [], evidence: [], tasks: [] })));
  } catch (err) {
    res.status(500).json({ error: 'Database Fetch Error' });
  }
});

app.post('/api/officers', authenticateToken, async (req, res) => {
  const { id, name, password, role, avatar } = req.body;
  try {
    await pool.query(
      'INSERT INTO officers (id, name, password, role, avatar) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name=$2, role=$4, avatar=$5',
      [id, name, password, role, avatar]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add officer to Neon' });
  }
});

app.delete('/api/officers/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM officers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete officer from Neon' });
  }
});

// WEBSOCKET LOGIC
const broadcast = (msg) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  });
};

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'TELEMETRY') {
        const { id, lat, lng, battery, status } = data.payload;
        broadcast([data.payload]);
        await pool.query(
          'UPDATE officers SET lat=$1, lng=$2, battery=$3, status=$4, last_update=NOW() WHERE id=$5',
          [lat, lng, battery, status, id]
        );
        await pool.query(
          'INSERT INTO location_history (node_id, lat, lng, battery, status) VALUES ($1, $2, $3, $4, $5)',
          [id, lat, lng, battery, status]
        );
      }
    } catch (e) {}
  });
});

server.listen(PORT, () => {
    console.log(`🚀 FleetGuard Server running on port ${PORT}`);
});
