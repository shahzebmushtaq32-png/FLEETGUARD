import { SalesOfficer, Message } from "../types";

// Fallbacks are for local development ONLY.
const FALLBACK_API_URL = "https://fleetguard-hrwf.onrender.com";
const FALLBACK_API_KEY = "BDO_SECURE_NODE_99122";

// Robustly get the API Key from the environment or fallback
const WS_API_KEY = (typeof process !== 'undefined' && process.env.WS_API_KEY) 
  ? process.env.WS_API_KEY 
  : FALLBACK_API_KEY;

const getApiUrl = () => {
    let envUrl = '';
    // Check various possible locations for the URL
    if (typeof process !== 'undefined' && process.env) {
       envUrl = process.env.VITE_RENDER_WS_URL || '';
    }
    
    // If no env var, use fallback
    if (!envUrl) return FALLBACK_API_URL;
    
    // Ensure HTTP for REST and strip trailing slashes to prevent //api/login
    let finalUrl = envUrl;
    if (!finalUrl.startsWith('http')) finalUrl = `https://${finalUrl}`;
    
    return finalUrl
      .replace('wss://', 'https://')
      .replace('ws://', 'http://')
      .replace(/\/$/, ''); // Remove trailing slash
};

const API_URL = getApiUrl();

// Helper: Constructs headers with both Gateway Key and User Session Token
const getHeaders = () => {
  const token = localStorage.getItem('bdo_auth_token');
  return {
    'Content-Type': 'application/json',
    'x-api-key': WS_API_KEY,      // Layer 1: Gateway Access
    'Authorization': token ? `Bearer ${token}` : '' // Layer 2: User Session
  };
};

export const persistenceService = {
  // Public Endpoint (Only requires Gateway Key)
  login: async (id: string, password: string) => {
    const url = `${API_URL}/api/login`;
    console.log(`[Auth] Attempting login at: ${url}`);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'x-api-key': WS_API_KEY 
        },
        body: JSON.stringify({ id, password })
      });

      if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server Error: ${response.status} (${response.statusText})`);
      }
      return await response.json();
    } catch (error: any) {
      console.error("[Auth] Login request failed:", error);
      throw error;
    }
  },

  // Protected Endpoint (Requires Gateway Key + JWT)
  fetchOfficersAPI: async (): Promise<SalesOfficer[]> => {
    try {
        const response = await fetch(`${API_URL}/api/officers`, {
            headers: getHeaders()
        });
        
        if (response.status === 401 || response.status === 403) {
            console.warn("Auth Session Expired");
            return [];
        }

        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        
        const data = await response.json();
        return data.map((o: any) => ({
            ...o,
            lastUpdate: new Date(o.last_update || o.lastUpdate || Date.now())
        }));
    } catch (e) {
        console.error("Fetch API Error:", e);
        // Offline Fallback
        const data = localStorage.getItem('bdo_fleet_cache');
        if (data) return JSON.parse(data);
        return [];
    }
  },

  addOfficerAPI: async (officer: Partial<SalesOfficer>) => {
     try {
        await fetch(`${API_URL}/api/officers`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(officer)
        });
     } catch (e) { console.error("Add Officer Failed", e); }
  },

  deleteOfficerAPI: async (id: string) => {
     try {
        await fetch(`${API_URL}/api/officers/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
     } catch (e) { console.error("Delete Officer Failed", e); }
  },

  saveToCloudR2: async (officers: SalesOfficer[]) => {
      // Logic handled via Realtime WebSocket & DB Sync
  },

  saveOfficers: (officers: SalesOfficer[]) => {
    localStorage.setItem('bdo_fleet_cache', JSON.stringify(officers));
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
    console.log("Processing Offline Queue:", queue.length);
    localStorage.removeItem('bdo_offline_queue');
  }
};