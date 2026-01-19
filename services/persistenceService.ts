
import { SalesOfficer } from "../types";
import { supabase } from "./supabaseClient";

const BACKEND_URL = localStorage.getItem('bdo_fleet_ws_url') || 'https://fleetguard-hrwf.onrender.com';
const API_KEY = "BDO_SECURE_NODE_99122";

export const persistenceService = {
  
  checkNode01: async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch { return false; }
  },

  checkNode02: async () => {
    if (!supabase) return false;
    try {
      const { error } = await supabase.from('officers').select('id').limit(1);
      return !error;
    } catch { return false; }
  },

  getNeonStats: async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/neon-stats?key=${API_KEY}`);
      return res.ok ? await res.json() : null;
    } catch { return null; }
  },

  checkR2Health: async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/r2-health?key=${API_KEY}`);
      return res.ok ? await res.json() : null;
    } catch { return null; }
  },

  fetchOfficersAPI: async (): Promise<SalesOfficer[]> => {
    const resultsMap = new Map<string, SalesOfficer>();
    const token = localStorage.getItem('bdo_auth_token') || 'dev-bypass-token';

    const tasks = [
      (async () => {
        if (!supabase) return;
        try {
          const { data } = await supabase.from('officers').select('*');
          data?.forEach(o => resultsMap.set(o.id, { 
            ...o, 
            lastUpdate: new Date(o.last_update || Date.now()), 
            leads: [], history: [], evidence: [], tasks: [] 
          }));
        } catch (e) { console.error("Supabase Fetch Error:", e); }
      })(),
      (async () => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/officers?key=${API_KEY}`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
          });
          if (res.ok) {
            const data = await res.json();
            data.forEach((o: any) => {
              const existing = resultsMap.get(o.id);
              if (!existing || new Date(o.last_update) > existing.lastUpdate) {
                resultsMap.set(o.id, { ...o, lastUpdate: new Date(o.last_update), leads: [], history: [], evidence: [], tasks: [] });
              }
            });
          }
        } catch (e) { console.error("Neon Fetch Error:", e); }
      })()
    ];

    await Promise.allSettled(tasks);
    return Array.from(resultsMap.values());
  },

  login: async (id: string, password: string) => {
    try {
      // Increased timeout to 15s to handle Render Free Tier cold starts
      const res = await fetch(`${BACKEND_URL}/api/login?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
        signal: AbortSignal.timeout(15000)
      });
      
      if (res.ok) return await res.json();
      
      if (res.status === 401) {
          throw new Error("Invalid Agent Credentials");
      }
    } catch (e: any) {
        if (e.name === 'TimeoutError' || e.message?.includes('fetch')) {
            console.warn("[Persistence] Server unreachable, attempting local bypass...");
        } else {
            throw e;
        }
    }

    // Standardized Bypass for ADM-ROOT and n1
    const isAdmin = (id === 'admin' || id === 'ADM-ROOT') && (password === 'admin' || password === '123');
    const isBDO = (id === 'n1') && (password === '12345' || password === '123');

    if (isAdmin) {
      return { token: 'dev-bypass-token', user: { id: 'ADM-ROOT', name: 'System Admin', role: 'Admin' } };
    }
    if (isBDO) {
        return { token: 'dev-bypass-token', user: { id: 'n1', name: 'James Wilson', role: 'BDO' } };
    }

    throw new Error("Login Failed: Unrecognized ID or Password");
  },

  addOfficerAPI: async (officer: Partial<SalesOfficer>) => {
    const token = localStorage.getItem('bdo_auth_token') || 'dev-bypass-token';
    const payload = { 
        ...officer, 
        role: officer.role || 'Senior BDO', 
        status: 'Offline', 
        password: officer.password || '123' 
    };

    console.log("[Sync] Deploying Node to dual-storage:", payload.id);

    // NEON WRITE
    const neonTask = fetch(`${BACKEND_URL}/api/officers?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    }).then(r => r.ok ? "Neon:OK" : `Neon:FAIL(${r.status})`);

    // SUPABASE WRITE
    let supabaseTask = Promise.resolve("Supabase:Skipped");
    if (supabase) {
      supabaseTask = supabase.from('officers').upsert({
        id: payload.id,
        name: payload.name,
        role: payload.role,
        password: payload.password,
        avatar: payload.avatar || '',
        status: 'Offline',
        last_update: new Date().toISOString()
      }).then(r => r.error ? `Supabase:FAIL(${r.error.message})` : "Supabase:OK");
    }

    const results = await Promise.allSettled([neonTask, supabaseTask]);
    console.log("[Sync] Final Write Report:", results.map(r => r.status === 'fulfilled' ? r.value : r.reason));
  },

  deleteOfficerAPI: async (id: string) => {
    const token = localStorage.getItem('bdo_auth_token') || 'dev-bypass-token';
    const tasks = [
      fetch(`${BACKEND_URL}/api/officers/${id}?key=${API_KEY}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }),
      supabase?.from('officers').delete().eq('id', id)
    ];
    await Promise.allSettled(tasks);
  },

  updateOfficerAvatarAPI: async (id: string, avatar: string) => {
    const token = localStorage.getItem('bdo_auth_token') || 'dev-bypass-token';
    const tasks = [
      fetch(`${BACKEND_URL}/api/officers/${id}?key=${API_KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ avatar })
      }),
      supabase?.from('officers').update({ avatar }).eq('id', id)
    ];
    await Promise.allSettled(tasks);
  },

  triggerCleanupAPI: async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/cleanup?key=${API_KEY}`, { method: 'POST' });
      return res.ok;
    } catch { return false; }
  }
};
