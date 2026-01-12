import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import pg from 'pg';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import cors from 'cors';

// Safer import for PG in ESM environments
const { Pool } = pg;

/**
 * RENDER REALTIME SERVER (Step 1 & 2)
 * Implementation of the "Blue Box" from your diagram.
 */

const app = express();
app.use(cors()); // Enable CORS for frontend requests
// INCREASED LIMIT: Allow large payloads for image uploads via proxy
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
// CHANGED: detached mode (noServer: true) to handle upgrade manually for Auth
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 10000;

// Shared Secret for Authentication
const WS_API_KEY = process.env.WS_API_KEY || "BDO_SECURE_NODE_99122";

// Middleware to Lock R2 Access & API Endpoints
const requireAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (apiKey !== WS_API_KEY) {
    console.warn(`[Security] Unauthorized Access Attempt from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: Missing or Invalid API Key' });
  }
  next();
};

// Step 2: Neon PostgreSQL Connection
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL || 'postgresql://neondb_owner:npg_bzq8XLNUV6YG@ep-tiny-king-ahricq41-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

// INITIALIZATION: Ensure Database Tables Exist
const initDB = async () => {
  try {
    // 1. Location History Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS location_history (
        id SERIAL PRIMARY KEY,
        node_id TEXT NOT NULL,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Officers/Users Table (New for Persistence)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS officers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'Account Executive',
        avatar TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log("✅ Database: Tables verified (location_history, officers).");
  } catch (err) {
    console.error("❌ Database Initialization Error:", err);
  }
};
initDB();

// Step 3: Cloudflare R2 Configuration (S3 Compatible)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "225bfea5d72cd356fb8697c55d29254c";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "bdo-fleet-data";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "b8a044d9823caf1e27850bcc6806f057";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "fd3e97181324351cec47f3fc27274aa3da02d320714a4745fbc608906887dd48";

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

console.log(`[R2] Storage Service initialized.`);

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).send('Healthy');
});

// --- API ENDPOINTS ---

/**
 * GET ALL OFFICERS
 */
app.get('/api/officers', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM officers');
    const officers = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      password: row.password,
      role: row.role,
      avatar: row.avatar,
      lat: 14.5547, lng: 121.0244,
      battery: 100, signalStrength: 100, networkType: '5G',
      status: 'Offline', lastUpdate: new Date(),
      leads: [], history: [], evidence: [], tasks: [],
      pipelineValue: 0, visitCount: 0, quotaProgress: 0,
      qrOnboarded: 0, qrActivated: 0, qrVolume: 0
    }));
    res.json(officers);
  } catch (err) {
    console.error("Fetch Officers Error:", err);
    res.status(500).json({ error: 'Failed to fetch officers' });
  }
});

/**
 * ADD NEW OFFICER
 */
app.post('/api/officers', requireAuth, async (req, res) => {
  const { id, name, password, role, avatar } = req.body;
  try {
    await pool.query(
      'INSERT INTO officers (id, name, password, role, avatar) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
      [id, name, password, role, avatar]
    );
    
    const newOfficer = { id, name, role, avatar, status: 'Offline' };
    wss.clients.forEach(client => {
       if (client.readyState === WebSocket.OPEN && client.clientType === 'dashboard') {
         client.send(JSON.stringify({ type: 'ROSTER_UPDATE', payload: newOfficer }));
       }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Add Officer Error:", err);
    res.status(500).json({ error: 'Failed to add officer' });
  }
});

/**
 * DELETE OFFICER
 */
app.delete('/api/officers/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM officers WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete Officer Error:", err);
    res.status(500).json({ error: 'Failed to delete officer' });
  }
});

/**
 * HISTORY API ENDPOINT
 */
app.get('/api/history/:nodeId', requireAuth, async (req, res) => {
  const { nodeId } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT lat, lng, timestamp FROM location_history WHERE node_id = $1 ORDER BY timestamp DESC LIMIT 100',
      [nodeId]
    );
    res.json(result.rows.reverse());
  } catch (err) {
    console.error("History Fetch Error:", err);
    res.status(500).json({ error: 'Database fetch failed' });
  }
});

/**
 * UPLOAD PROXY ENDPOINT
 */
app.post('/api/upload-proxy', requireAuth, async (req, res) => {
  const { fileName, fileType, fileData } = req.body;

  if (!fileName || !fileData) {
    return res.status(400).json({ error: 'Missing fileName or fileData' });
  }

  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `evidence/${Date.now()}_${safeFileName}`;

  try {
    const buffer = Buffer.from(fileData.replace(/^data:image\/\w+;base64,/, ""), 'base64');

    const putCommand = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: fileType || 'image/jpeg',
    });
    
    await r2.send(putCommand);

    const getCommand = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key
    });
    
    const readUrl = await getSignedUrl(r2, getCommand, { expiresIn: 3600 * 24 * 7 });

    res.json({
      success: true,
      publicUrl: readUrl,
      key: key
    });

  } catch (err) {
    console.error("R2 Upload Proxy Error:", err);
    res.status(500).json({ error: 'Failed to upload file to storage.' });
  }
});

/**
 * WEBSOCKET HEARTBEAT & AUTHENTICATION
 */
function heartbeat() {
  this.isAlive = true;
}

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', function close() {
  clearInterval(interval);
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const clientKey = url.searchParams.get('key');

  if (clientKey !== WS_API_KEY) {
    console.warn(`[Auth] Rejected WebSocket connection attempt: Invalid Key`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const clientType = url.searchParams.get('type') || 'iot'; 
  ws.clientType = clientType;

  console.log(`[Step 1] Authorized ${clientType.toUpperCase()} node Connected.`);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'TELEMETRY') {
        const { id, lat, lng } = data.payload;
        try {
            await pool.query(
            'INSERT INTO location_history (node_id, lat, lng) VALUES ($1, $2, $3)',
            [id, lat, lng]
            );
        } catch(e) { console.error("DB Save Error:", e); }

        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN && client.clientType === 'dashboard') {
            client.send(JSON.stringify([data.payload]));
          }
        });
      }
    } catch (err) {
      console.error("Error processing telemetry:", err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Render Realtime Server running on port ${PORT}`);
});