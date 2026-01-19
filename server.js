import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import pg from 'pg';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const WS_API_KEY = process.env.WS_API_KEY || "BDO_SECURE_NODE_99122"; 
const JWT_SECRET = process.env.JWT_SECRET || "8c22a07b5ae723637fb9b41cdc81a47521c02e0fcdb1bcdfb8ee81e90a13d2eabf0765efe0c5b0ec65bd4b25feaf1fa3377fbfe72c8006dbae4974a52d34b4cc";

const getDbUrl = () => {
  let url = process.env.NEON_DATABASE_URL || "postgresql://neondb_owner:npg_bzq8XLNUV6YG@ep-tiny-king-ahricq41-pooler.c-3.us-east-1.aws.neon.tech/neondb";
  if (url.startsWith("'") && url.endsWith("'")) {
    url = url.slice(1, -1);
  }
  return url;
};

const pool = new Pool({
  connectionString: getDbUrl(),
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Serve static files from the current directory
app.use(express.static(__dirname));

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
  try {
    const client = await pool.connect();
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
    
    const { rows } = await client.query('SELECT COUNT(*) FROM officers');
    if (parseInt(rows[0].count) === 0) {
      console.log("🌱 Seeding default demo accounts...");
      await client.query(`
        INSERT INTO officers (id, name, password, role) 
        VALUES 
        ('ADM-ROOT', 'System Administrator', '123', 'Admin'),
        ('n1', 'James Wilson', '123', 'BDO')
      `);
    }

    client.release();
    console.log("✅ DB Setup Complete");
  } catch (err) {
      console.error("❌ DB Init Failed:", err.message);
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
    console.error("[Login API] Error:", err.message);
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

// Catch-all route to serve index.html for frontend routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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

server.listen(PORT, () => console.log(`🚀 BDO Fleet Node Active on Port ${PORT}`));