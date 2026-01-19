
import { SalesOfficer } from "../types";
import { supabase } from "./supabaseClient";

/**
 * Backend API Configuration for BDO Fleet Guard
 * Primary Node: https://fleetguard-hrwf.onrender.com
 */
const BACKEND_URL = 'https://fleetguard-hrwf.onrender.com';
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
    // 1. Try backend authentication
    try {
      const res = await fetch(`${BACKEND_URL}/api/login?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
        signal: AbortSignal.timeout(15000)
      });
      
      if (res.ok) return await res.json();
      
      // If server explicitly says 401, but it's a known demo account, fall through to bypass
      if (res.status === 401) {
          console.warn("[Persistence] Backend auth failed, checking local bypass...");
      }
    } catch (e: any) {
        console.warn("[Persistence] Backend unreachable, checking local bypass...");
    }

    // 2. Local Bypass Fallback (Essential for Demo/Cold Starts)
    const isAdmin = (id === 'admin' || id === 'ADM-ROOT') && (password === 'admin' || password === '123' || password === '12345');
    const isBDO = (id === 'n1') && (password === '123' || password === '12345');

    if (isAdmin) {
      return { token: 'dev-bypass-token', user: { id: 'ADM-ROOT', name: 'System Admin', role: 'Admin' } };
    }
    if (isBDO) {
        return { token: 'dev-bypass-token', user: { id: 'n1', name: 'James Wilson', role: 'BDO' } };
    }

    throw new Error("Login Failed: Unrecognized Agent Credentials");
  },

  addOfficerAPI: async (officer: Partial<SalesOfficer>) => {
    const token = localStorage.getItem('bdo_auth_token') || 'dev-bypass-token';
    const payload = { 
        ...officer, 
        role: officer.role || 'Senior BDO', 
        status: 'Offline', 
        password: officer.password || '123' 
    };

    const neonTask = fetch(`${BACKEND_URL}/api/officers?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    }).then(r => r.ok ? "Neon:OK" : `Neon:FAIL(${r.status})`);

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

    await Promise.allSettled([neonTask, supabaseTask]);
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
