
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      'process.env.VITE_RENDER_WS_URL': JSON.stringify(env.VITE_RENDER_WS_URL),
      'process.env.WS_API_KEY': JSON.stringify(env.VITE_WS_API_KEY || env.WS_API_KEY),
      // Fix: Explicitly define process.env.API_KEY to ensure Gemini SDK functions correctly.
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY),
      'process.env': {} 
    },
    server: {
      port: 3000
    }
  };
});
