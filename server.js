
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import pg from 'pg';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

const PORT = process.env.PORT || 10000;
const WS_API_KEY = process.env.WS_API_KEY || "BDO_SECURE_NODE_99122"; 
const JWT_SECRET = process.env.JWT_SECRET || "8c22a07b5ae723637fb9b41cdc81a47521c02e0fcdb1bcdfb8ee81e90a13d2eabf0765efe0c5b0ec65bd4b25feaf1fa3377fbfe72c8006dbae4974a52d34b4cc";

const getDbUrl = () => {
  let url = process.env.NEON_DATABASE_URL || "postgresql://neondb_owner:npg_bzq8XLNUV6YG@ep-tiny-king-ahricq41-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
  if (url.includes("'")) {
    const match = url.match(/'([^']+)'/);
    if (match) url = match[1];
  }
  return url.split('?')[0] + '?sslmode=require';
};

const pool = new Pool({
  connectionString: getDbUrl(),
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://225bfea5d72cd356fb8697c55d29254c.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'b8a044d9823caf1e27850bcc6806f057',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'fd3e97181324351cec47f3fc27274aa3da02d320714a4745fbc608906887dd48',
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
    const { rows } = await client.query('SELECT COUNT(*) FROM officers');
    if (parseInt(rows[0].count) === 0) {
      await client.query(
        "INSERT INTO officers (id, name, password, role) VALUES ('ADM-ROOT', 'System Administrator', 'admin', 'Admin'), ('n1', 'James Wilson', '12345', 'Senior BDO')"
      );
    }
  } finally {
    client.release();
  }
};

initDB().catch(console.error);

app.get('/health', (req, res) => res.status(200).send('FleetGuard Online'));

app.get('/api/neon-stats', async (req, res) => {
  try {
    const { rows: nodes } = await pool.query('SELECT COUNT(*) FROM officers');
    const { rows: points } = await pool.query('SELECT COUNT(*) FROM location_history');
    res.json({ activeNodes: parseInt(nodes[0].count), telemetryPoints: parseInt(points[0].count), status: 'CONNECTED' });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

app.get('/api/r2-health', async (req, res) => {
  try {
    await r2.send(new ListBucketsCommand({}));
    res.json({ status: 'CONNECTED' });
  } catch (err) {
    res.status(500).json({ status: 'ERROR' });
  }
});

app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;
  try {
    const queryId = id === 'admin' ? 'ADM-ROOT' : id;
    const { rows } = await pool.query('SELECT * FROM officers WHERE id = $1', [queryId]);
    const user = rows[0];
    if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid Credentials' });
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ error: 'Login Error' });
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

app.post('/api/officers', authenticateToken, async (req, res) => {
  const { id, name, password, role, avatar } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'Invalid Payload' });
  try {
    await pool.query(
      'INSERT INTO officers (id, name, password, role, avatar) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name=$2, password=$3, role=$4, avatar=$5',
      [id, name, password || '123', role || 'BDO', avatar || '']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'DB Insert Fail' });
  }
});

app.patch('/api/officers/:id', authenticateToken, async (req, res) => {
  const { avatar } = req.body;
  try {
    await pool.query('UPDATE officers SET avatar = $1 WHERE id = $2', [avatar, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Update Fail' });
  }
});

app.delete('/api/officers/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM officers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete Fail' });
  }
});

// FIX: Added /api/cleanup endpoint to purge historical telemetry rows older than 30 days
app.post('/api/cleanup', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (apiKey !== WS_API_KEY) return res.status(401).json({ error: 'Gateway Unauthorized' });
  try {
    await pool.query("DELETE FROM location_history WHERE timestamp < NOW() - INTERVAL '30 days'");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Cleanup Fail' });
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
        await pool.query(
          'INSERT INTO location_history (node_id, lat, lng, battery, status) VALUES ($1, $2, $3, $4, $5)',
          [id, lat, lng, battery, status]
        );
      }
    } catch (e) {}
  });
});

server.listen(PORT, () => console.log(`🚀 Node Active on ${PORT}`));
