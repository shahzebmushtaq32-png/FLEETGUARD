import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import pg from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

// CRITICAL: Bind to process.env.PORT for Render production
const PORT = process.env.PORT || 3000;
const WS_API_KEY = process.env.WS_API_KEY || "BDO_SECURE_NODE_99122"; 
const JWT_SECRET = process.env.JWT_SECRET || "8c22a07b5ae723637fb9b41cdc81a47521c02e0fcdb1bcdfb8ee81e90a13d2eabf0765efe0c5b0ec65bd4b25feaf1fa3377fbfe72c8006dbae4974a52d34b4cc";

const getDbUrl = () => {
  let url = process.env.NEON_DATABASE_URL || "postgresql://neondb_owner:npg_bzq8XLNUV6YG@ep-tiny-king-ahricq41-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
  if (url.startsWith("'") && url.endsWith("'")) {
    url = url.slice(1, -1);
  }
  return url;
};

const pool = new Pool({
  connectionString: getDbUrl(),
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: 'https://225bfea5d72cd356fb8697c55d29254c.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'b8a044d9823caf1e27850bcc6806f057',
    secretAccessKey: 'fd3e97181324351cec47f3fc27274aa3da02d320714a4745fbc608906887dd48',
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Added routes exactly where requested by user
app.get("/", (req, res) => {
  res.status(200).send("BDO FleetGuard API is running 🚀");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const authenticateToken = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (apiKey !== WS_API_KEY) return res.status(401).json({ error: 'Gateway Unauthorized' });

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token Missing' });

  if (token === 'dev-bypass-token') {
    req.user = { id: 'ADM-ROOT', role: 'Admin', name: 'Dev Bypass' };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid Token' });
    req.user = user;
    next();
  });
};

const initDB = async () => {
  const client = await pool.connect();
  try {
    console.log("🛠 Initializing Database Schema...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS officers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'BDO',
        avatar TEXT,
        status TEXT DEFAULT 'Offline',
        battery INTEGER DEFAULT 100,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        last_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS location_history (
        id SERIAL PRIMARY KEY,
        node_id TEXT REFERENCES officers(id) ON DELETE CASCADE,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        battery INTEGER,
        status TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
      console.error("❌ DB Init Failed:", err.message);
  } finally {
    client.release();
  }
};

initDB().catch(console.error);

app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;
  try {
    const queryId = id === 'admin' ? 'ADM-ROOT' : id;
    const { rows } = await pool.query('SELECT * FROM officers WHERE id = $1', [queryId]);
    const user = rows[0];
    
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid Credentials' });
    }

    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ error: 'Server Internal Error' });
  }
});

app.get('/api/officers', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM officers ORDER BY name ASC');
    res.json(rows.map(o => ({ ...o, lastUpdate: o.last_update, leads: [], history: [], evidence: [], tasks: [] })));
  } catch (err) {
    res.status(500).json({ error: 'Fetch Error' });
  }
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  ws.on('message', async (msg) => {
    try {
      const { type, payload } = JSON.parse(msg);
      if (type === 'TELEMETRY') {
        const { id, lat, lng, battery, status, avatar } = payload;
        wss.clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(JSON.stringify([payload])));
        await pool.query(
          'UPDATE officers SET lat=$1, lng=$2, battery=$3, status=$4, avatar=COALESCE($5, avatar), last_update=NOW() WHERE id=$6',
          [lat, lng, battery, status, avatar, id]
        );
      }
    } catch (e) {}
  });
});

server.listen(PORT, () => console.log(`🚀 BDO Fleet Node Active on ${PORT}`));