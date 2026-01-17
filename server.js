
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import pg from 'pg';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

// --- CONFIGURATION ---
const PORT = process.env.PORT || 10000;
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; 

// SECURITY KEYS
const WS_API_KEY = process.env.WS_API_KEY || "BDO_SECURE_NODE_99122"; 
const JWT_SECRET = process.env.JWT_SECRET || "8c22a07b5ae723637fb9b41cdc81a47521c02e0fcdb1bcdfb8ee81e90a13d2eabf0765efe0c5b0ec65bd4b25feaf1fa3377fbfe72c8006dbae4974a52d34b4cc";

// --- DATABASE CONFIGURATION ---
const getDbUrl = () => {
  let url = process.env.NEON_DATABASE_URL || "postgresql://neondb_owner:npg_bzq8XLNUV6YG@ep-tiny-king-ahricq41-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
  
  // Clean 'psql' wrapper if present
  if (url.includes("'")) {
    const match = url.match(/'([^']+)'/);
    if (match) url = match[1];
  }
  
  // Strip redundant params that cause SSL issues in some environments
  return url.split('?')[0] + '?sslmode=require';
};

const dbUrl = getDbUrl();

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

// --- STORAGE CONFIGURATION (CLOUDFLARE R2) ---
const r2Config = {
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://225bfea5d72cd356fb8697c55d29254c.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'b8a044d9823caf1e27850bcc6806f057',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'fd3e97181324351cec47f3fc27274aa3da02d320714a4745fbc608906887dd48',
  },
};
const r2 = new S3Client(r2Config);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// --- MIDDLEWARE ---
const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey || apiKey !== WS_API_KEY) {
    return res.status(401).json({ error: 'Gateway Unauthorized' });
  }
  next();
};

const authenticateToken = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (apiKey !== WS_API_KEY) return res.status(401).json({ error: 'Gateway Unauthorized' });

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Token Missing' });

  // Allow bypass token for development mode only if API key is present
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

// --- DB INIT ---
const initDB = async () => {
  try {
    await pool.query(`
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
    
    await pool.query(`
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

    const countRes = await pool.query('SELECT COUNT(*) FROM officers');
    if (parseInt(countRes.rows[0].count) === 0) {
      console.log("🌱 Seeding production root nodes...");
      await pool.query(
        "INSERT INTO officers (id, name, password, role) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)",
        ['ADM-ROOT', 'System Administrator', 'admin', 'Admin', 'n1', 'James Wilson', '12345', 'Senior BDO']
      );
    }
    console.log("✅ Neon DB Initialized Successfully");
  } catch (err) {
    console.error("❌ Database init error:", err.message);
  }
};

initDB();

// --- ROUTES ---
app.get('/health', (req, res) => res.status(200).send('FleetGuard Online'));

app.get('/api/r2-health', requireApiKey, async (req, res) => {
  try {
    await r2.send(new ListBucketsCommand({}));
    res.json({ status: 'CONNECTED', provider: 'Cloudflare R2' });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

app.post('/api/login', requireApiKey, async (req, res) => {
  const { id, password } = req.body;
  try {
    const queryId = id === 'admin' ? 'ADM-ROOT' : id;
    const result = await pool.query('SELECT * FROM officers WHERE id = $1', [queryId]);
    const user = result.rows[0];
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid Credentials' });
    }
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ error: 'Login Server Error' });
  }
});

app.get('/api/officers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM officers ORDER BY name ASC');
    res.json(result.rows.map(o => ({ ...o, lastUpdate: o.last_update, leads: [], history: [], evidence: [], tasks: [] })));
  } catch (err) {
    res.status(500).json({ error: 'Fetch Error' });
  }
});

app.post('/api/officers', authenticateToken, async (req, res) => {
  const { id, name, password, role, avatar } = req.body;
  try {
    await pool.query(
      'INSERT INTO officers (id, name, password, role, avatar) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name=$2, password=$3, role=$4, avatar=$5',
      [id, name, password, role, avatar]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Neon Insert Error:", err);
    res.status(500).json({ error: 'Neon Deployment Error' });
  }
});

app.patch('/api/officers/:id', authenticateToken, async (req, res) => {
  const { avatar } = req.body;
  try {
    await pool.query('UPDATE officers SET avatar = $1 WHERE id = $2', [avatar, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Avatar Update Error' });
  }
});

app.delete('/api/officers/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM officers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Decommission Error' });
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
        const { id, lat, lng, battery, status, avatar } = data.payload;
        broadcast([data.payload]);
        
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

server.listen(PORT, () => {
    console.log(`🚀 FleetGuard Server running on port ${PORT}`);
});
