import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Vital: Polyfill process.env variables individually
      // Do NOT overwrite the entire process.env object as it breaks internal node/vite checks
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.VITE_RENDER_WS_URL': JSON.stringify(env.VITE_RENDER_WS_URL),
      'process.env.WS_API_KEY': JSON.stringify(env.VITE_WS_API_KEY || env.WS_API_KEY),
      // Fallback for safety if code accesses process.env directly
      'process.env': {} 
    },
    server: {
      port: 3000
    }
  };
});