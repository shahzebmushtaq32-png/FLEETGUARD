import { createClient } from '@supabase/supabase-js';

// Safe environment variable access for browser
const SUPABASE_URL = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || 'https://vpriyflmlhmfuvyurexp.supabase.co';
const SUPABASE_ANON_KEY = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwcml5ZmxtbGhtZnV2eXVyZXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NjEyNzgsImV4cCI6MjA4NDEzNzI3OH0.F4MXNc4H2n4PZY4RWYlCTqTtem0ioZQKZwOohW7gUfI';

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
    console.log("⚠️ Running in Local/Demo Mode");
}

export const supabase = client;