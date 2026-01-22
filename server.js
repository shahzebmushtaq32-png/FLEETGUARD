import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import pg from 'pg';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;
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

// --- API ENDPOINTS ---

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

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
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/officers', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM officers ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database Fetch Error' });
  }
});

// --- STATIC FRONTEND SERVING ---

const distPath = path.join(__dirname, "dist");

if (fs.existsSync(distPath)) {
  console.log(`📦 Serving production frontend from: ${distPath}`);
  app.use(express.static(distPath));
  
  // SPA Catch-all: Send index.html for any non-API route
  app.get("*", (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  console.warn("⚠️ Warning: /dist folder not found. API mode only.");
  app.get("/", (req, res) => {
    res.send("🚀 BDO Fleet Guard Node Active. UI build (dist/) not detected.");
  });
}

// --- REALTIME SERVER ---

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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

server.listen(PORT, () => {
  console.log(`🚀 BDO Fleet Node Active on Port ${PORT}`);
});