import { createClient } from '@supabase/supabase-js';

// Safe environment variable access
const getEnvVar = (key: string) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  return '';
};

/**
 * Supabase Configuration for BDO Fleet Guard
 * Updated with user-provided credentials for project 'aunwiryjnmogsnmstbko'
 */
const SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL') || 'https://aunwiryjnmogsnmstbko.supabase.co';
const SUPABASE_ANON_KEY = getEnvVar('VITE_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bndpcnlqbm1vZ3NubXN0YmtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NDUxMTQsImV4cCI6MjA4NDEyMTExNH0.Cg6bhZqPYIjCKWURoK8F28PrwJ-zU-DkKxCXWMWT_ck';

let client = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
        client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
            },
            realtime: {
                params: {
                    eventsPerSecond: 10,
                },
            },
        });
    } catch (e) {
        console.warn("Supabase Init Failed:", e);
    }
} else {
    console.log("⚠️ Running in Local/Demo Mode (No Supabase Keys found)");
}

export const supabase = client;