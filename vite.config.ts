import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Vital: Polyfill process.env variables individually to avoid clobbering Node defaults
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.VITE_RENDER_WS_URL': JSON.stringify(env.VITE_RENDER_WS_URL),
      'process.env.WS_API_KEY': JSON.stringify(env.VITE_WS_API_KEY),
      // Ensure global process.env exists but don't overwrite it entirely if possible, 
      // but for the SDK we might need a fallback object if it checks existence.
      // This simple object assignment is safer than replacing the whole process.env
      'process.env': {
         API_KEY: env.API_KEY,
         VITE_RENDER_WS_URL: env.VITE_RENDER_WS_URL,
         WS_API_KEY: env.VITE_WS_API_KEY
      }
    },
    server: {
      port: 3000
    }
  };
});