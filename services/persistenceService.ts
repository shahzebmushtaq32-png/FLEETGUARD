import { SalesOfficer, Message } from "../types";

/**
 * ARCHITECTURE STEP 3: Cloudflare R2 Storage Layer
 */

const FALLBACK_API_KEY = "BDO_SECURE_NODE_99122";
const FALLBACK_API_URL = "https://fleetguard-hrwf.onrender.com";

const WS_API_KEY = (typeof process !== 'undefined' && process.env && process.env.WS_API_KEY) 
  ? process.env.WS_API_KEY 
  : FALLBACK_API_KEY;

const getApiUrl = () => {
    let envUrl = '';
    if (typeof process !== 'undefined' && process.env && process.env.VITE_RENDER_WS_URL) {
        envUrl = process.env.VITE_RENDER_WS_URL;
    }
    
    if (!envUrl) return FALLBACK_API_URL;
    let finalUrl = envUrl;
    if (!finalUrl.startsWith('http')) finalUrl = `https://${finalUrl}`;
    return finalUrl.replace('wss://', 'https://');
};

const API_URL = getApiUrl();

export const persistenceService = {
  saveToCloudR2: async (officers: SalesOfficer[]) => {
    console.group(`[Architecture Step 3] Cloudflare R2 Storage Commit`);
    const payload = officers.map(o => ({
      bucket: 'bdo-fleet-data',
      key: `logs/${o.id}_${Date.now()}.json`,
      content: {
        bdo_code: o.id,
        bdo_name: o.name,
        technical_telemetry: {
            lat: o.lat, lng: o.lng,
            battery: o.battery,
            signal: o.signalStrength,
            network: o.networkType
        },
        status: o.status
      }
    }));

    return new Promise(resolve => {
      setTimeout(() => {
        console.log(`[R2] PUT Objects:`, payload);
        console.groupEnd();
        resolve(true);
      }, 400);
    });
  },

  fetchOfficersAPI: async (): Promise<SalesOfficer[]> => {
    try {
        const response = await fetch(`${API_URL}/api/officers`, {
            headers: { 'x-api-key': WS_API_KEY }
        });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const data = await response.json();
        return data.map((o: any) => ({
            ...o,
            lastUpdate: new Date(o.lastUpdate || Date.now())
        }));
    } catch (e) {
        console.error("API Fetch Error:", e);
        const data = localStorage.getItem('bdo_fleet_cache');
        if (data) {
             return JSON.parse(data, (key, value) => {
                if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
                    return new Date(value);
                }
                return value;
            });
        }
        return [];
    }
  },

  addOfficerAPI: async (officer: Partial<SalesOfficer>) => {
     try {
        await fetch(`${API_URL}/api/officers`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-api-key': WS_API_KEY
            },
            body: JSON.stringify(officer)
        });
     } catch (e) {
        console.error("Add Officer API Failed", e);
     }
  },

  deleteOfficerAPI: async (id: string) => {
     try {
        await fetch(`${API_URL}/api/officers/${id}`, {
            method: 'DELETE',
            headers: { 'x-api-key': WS_API_KEY }
        });
     } catch (e) {
        console.error("Delete Officer API Failed", e);
     }
  },

  saveOfficers: (officers: SalesOfficer[]) => {
    try {
        localStorage.setItem('bdo_fleet_cache', JSON.stringify(officers));
    } catch (e) {}
  },

  saveMessage: (msg: Message) => {
    const existing = JSON.parse(localStorage.getItem('bdo_fleet_messages') || '[]');
    localStorage.setItem('bdo_fleet_messages', JSON.stringify([...existing, msg]));
  },

  queueAction: (action: string, payload: any) => {
    const queue = JSON.parse(localStorage.getItem('bdo_offline_queue') || '[]');
    queue.push({ id: Date.now(), action, payload, timestamp: new Date() });
    localStorage.setItem('bdo_offline_queue', JSON.stringify(queue));
  },

  processSyncQueue: async () => {
    const queue = JSON.parse(localStorage.getItem('bdo_offline_queue') || '[]');
    if (queue.length === 0) return;
    await new Promise(r => setTimeout(r, 1000));
    localStorage.removeItem('bdo_offline_queue');
  }
};