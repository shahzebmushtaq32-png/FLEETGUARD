
import { SalesOfficer, Message, Incident } from "../types";
import { supabase } from "./supabaseClient";

const BACKEND_URL = localStorage.getItem('bdo_fleet_ws_url') || 'https://fleetguard-hrwf.onrender.com';
const API_KEY = "BDO_SECURE_NODE_99122";

export const persistenceService = {
  
  checkNode01: async (): Promise<boolean> => {
    try {
        const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch (e) {
        return false;
    }
  },

  checkNode02: async (): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { data, error } = await supabase.from('officers').select('id').limit(1);
        return !error;
    } catch (e) {
        return false;
    }
  },

  getNeonStats: async () => {
    try {
        const res = await fetch(`${BACKEND_URL}/api/neon-stats?key=${API_KEY}`);
        if (res.ok) return await res.json();
        return null;
    } catch (e) {
        return null;
    }
  },

  triggerCleanupAPI: async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/maintenance/cleanup?key=${API_KEY}`, {
        method: 'POST'
      });
      return response.ok;
    } catch (e) {
      return false;
    }
  },

  fetchOfficersAPI: async (): Promise<SalesOfficer[]> => {
    const resultsMap = new Map<string, SalesOfficer>();

    const fetchTasks = [
        (async () => {
            if (!supabase) return;
            try {
                const { data } = await supabase.from('officers').select('*');
                if (data) {
                    data.forEach((o: any) => {
                        resultsMap.set(o.id, {
                            ...o,
                            lastUpdate: new Date(o.last_update || o.lastUpdate || Date.now()),
                            telemetrySource: 'SUPER_DB',
                            leads: o.leads || [],
                            history: [],
                            evidence: [],
                            tasks: o.tasks || []
                        });
                    });
                }
            } catch (e) {}
        })(),
        (async () => {
            try {
                const token = localStorage.getItem('bdo_auth_token');
                const response = await fetch(`${BACKEND_URL}/api/officers?key=${API_KEY}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const newData = await response.json();
                    newData.forEach((o: any) => {
                        const currentUpdate = new Date(o.last_update || o.lastUpdate || 0);
                        const existing = resultsMap.get(o.id);
                        if (!existing || currentUpdate >= new Date(existing.lastUpdate)) {
                            resultsMap.set(o.id, { 
                                ...o, 
                                telemetrySource: 'NEW_DB',
                                lastUpdate: currentUpdate,
                                leads: o.leads || [], 
                                history: [], 
                                evidence: [], 
                                tasks: o.tasks || []
                            });
                        }
                    });
                }
            } catch (e) {}
        })()
    ];

    await Promise.allSettled(fetchTasks);
    return Array.from(resultsMap.values());
  },

  login: async (id: string, password: string) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/login?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, password }),
            signal: AbortSignal.timeout(5000)
        });
        if (response.ok) return await response.json();
    } catch (e) {
        console.warn("[Persistence] Backend login failed, checking bypass...");
    }

    // AUTH BYPASS FOR LOCAL/DEV DEMO
    if (id === 'admin' && (password === 'admin' || password === '123')) {
         return { 
            token: 'dev-bypass-token', 
            user: { id: 'ADM-ROOT', name: 'Administrator (Bypass)', role: 'Admin' } 
         };
    }

    if (id === 'n1' && (password === '12345' || password === '123')) {
        return {
            token: 'dev-bypass-token',
            user: { id: 'n1', name: 'James Wilson', role: 'BDO' }
        };
    }

    throw new Error("Access Denied: Node verification failed.");
  },

  updateOfficerAvatarAPI: async (id: string, avatarUrl: string) => {
    const token = localStorage.getItem('bdo_auth_token');
    const promises = [
        fetch(`${BACKEND_URL}/api/officers/${id}?key=${API_KEY}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ avatar: avatarUrl })
        })
    ];
    if (supabase) {
        promises.push(supabase.from('officers').update({ avatar: avatarUrl, last_update: new Date() }).eq('id', id));
    }
    await Promise.allSettled(promises);
  },

  addOfficerAPI: async (officer: Partial<SalesOfficer>) => {
     const payload = {
         ...officer,
         lastUpdate: new Date().toISOString(),
         status: 'Offline'
     };

     const token = localStorage.getItem('bdo_auth_token');
     const promises = [
         fetch(`${BACKEND_URL}/api/officers?key=${API_KEY}`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
             body: JSON.stringify(payload)
         })
     ];

     if (supabase) {
        promises.push(supabase.from('officers').upsert({
            id: officer.id,
            name: officer.name,
            role: officer.role || 'Senior BDO',
            status: 'Offline',
            last_update: new Date(),
            password: officer.password || '123',
            leads: officer.leads || [],
            tasks: []
        }));
     }
     
     await Promise.allSettled(promises);
  },

  deleteOfficerAPI: async (id: string) => {
    const token = localStorage.getItem('bdo_auth_token');
    const promises = [
        fetch(`${BACKEND_URL}/api/officers/${id}?key=${API_KEY}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        })
    ];
    if (supabase) {
      promises.push(supabase.from('officers').delete().eq('id', id));
    }
    await Promise.allSettled(promises);
  },

  assignTaskAPI: async (officerId: string, task: any) => {
      if (supabase) {
          const { data } = await supabase.from('officers').select('tasks').eq('id', officerId).single();
          const currentTasks = data?.tasks || [];
          await supabase.from('officers').update({ tasks: [task, ...currentTasks] }).eq('id', officerId);
      }
  }
};
