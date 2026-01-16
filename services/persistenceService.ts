
import { SalesOfficer, Message, Incident } from "../types";
import { supabase } from "./supabaseClient";

const BACKEND_URL = localStorage.getItem('bdo_fleet_ws_url') || 'https://fleetguard-hrwf.onrender.com';
const API_KEY = "BDO_SECURE_NODE_99122";

export const persistenceService = {
  
  // Health Checks for Infrastructure Monitor
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

  fetchOfficersAPI: async (): Promise<SalesOfficer[]> => {
    const resultsMap = new Map<string, SalesOfficer>();

    try {
        // 1. Fetch from 'Super' (Supabase)
        if (supabase) {
            const { data: superData } = await supabase.from('officers').select('*');
            if (superData) {
                superData.forEach((o: any) => {
                    const mappedOfficer: SalesOfficer = {
                        ...o,
                        lastUpdate: new Date(o.last_update || Date.now()),
                        telemetrySource: 'SUPER_DB',
                        leads: o.leads || [],
                        history: [],
                        evidence: [],
                        tasks: o.tasks || []
                    };
                    resultsMap.set(o.id, mappedOfficer);
                });
            }
        }

        // 2. Fetch from 'New' (Render/Neon API)
        const token = localStorage.getItem('bdo_auth_token');
        const response = await fetch(`${BACKEND_URL}/api/officers?key=${API_KEY}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const newData = await response.json();
            newData.forEach((o: SalesOfficer) => {
                const existing = resultsMap.get(o.id);
                const currentUpdate = new Date(o.lastUpdate || 0);
                if (!existing || currentUpdate > new Date(existing.lastUpdate)) {
                    resultsMap.set(o.id, { 
                        ...o, 
                        telemetrySource: 'NEW_DB',
                        lastUpdate: currentUpdate
                    });
                }
            });
        }
    } catch (e) {
        console.warn("Sync Node Warning:", e);
    }

    return Array.from(resultsMap.values());
  },

  login: async (id: string, password: string) => {
    // 1. Attempt login against the New Database (Render Auth)
    try {
        const response = await fetch(`${BACKEND_URL}/api/login?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, password }),
            signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.warn("Node 01 Auth Unreachable, failing over to Node 02...");
    }

    // 2. Fallback to Super DB (Supabase)
    if (supabase) {
        try {
            const { data: profile, error } = await supabase.from('officers').select('*').eq('id', id).single();
            // In demo mode, if the user exists in Supabase, we allow '123' or 'admin' password
            if (!error && profile && (password === '123' || password === 'admin' || password === profile.password)) {
                return {
                    token: 'fallback-token-node2',
                    user: { ...profile, lastUpdate: new Date() }
                };
            }
        } catch (e) {
            console.warn("Node 02 Auth Failed.");
        }
    }

    // 3. Last Resort: Hardcoded Developer Bypass (Ensures you are NEVER locked out)
    if (id === 'admin' && password === 'admin') {
         return { 
            token: 'dev-bypass-token', 
            user: { id: 'ADM-ROOT', name: 'Administrator (Bypass)', role: 'Admin' } 
         };
    }

    throw new Error("Access Denied: Verification failed on all database nodes.");
  },

  addOfficerAPI: async (officer: Partial<SalesOfficer>) => {
     const promises = [];
     if (supabase) {
        promises.push(supabase.from('officers').upsert({
            id: officer.id,
            name: officer.name,
            role: officer.role,
            status: officer.status || 'Offline',
            last_update: new Date(),
            password: officer.password || '123'
        }));
     }
     
     const token = localStorage.getItem('bdo_auth_token');
     promises.push(fetch(`${BACKEND_URL}/api/officers?key=${API_KEY}`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
         body: JSON.stringify(officer)
     }));

     await Promise.allSettled(promises);
  },

  // Fix: Added missing deleteOfficerAPI method to handle personnel removal in the Admin Dashboard.
  deleteOfficerAPI: async (id: string) => {
    const promises = [];
    if (supabase) {
      promises.push(supabase.from('officers').delete().eq('id', id));
    }
    
    const token = localStorage.getItem('bdo_auth_token');
    promises.push(fetch(`${BACKEND_URL}/api/officers/${id}?key=${API_KEY}`, {
      method: 'DELETE',
      headers: { 
        'Authorization': `Bearer ${token}` 
      }
    }));

    await Promise.allSettled(promises);
  },

  assignTaskAPI: async (officerId: string, task: any) => {
      if (supabase) {
          const { data } = await supabase.from('officers').select('tasks').eq('id', officerId).single();
          const currentTasks = data?.tasks || [];
          await supabase.from('officers').update({ tasks: [task, ...currentTasks] }).eq('id', officerId);
      }
  },

  saveMessage: async (msg: Message) => {
      if (supabase) {
          await supabase.from('messages').insert({
              text: msg.text,
              sender_id: msg.senderId,
              sender_name: msg.senderName,
              is_from_admin: msg.isFromAdmin,
              is_directive: msg.isDirective
          });
      }
  }
};
