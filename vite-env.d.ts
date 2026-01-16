
interface ImportMetaEnv {
  readonly VITE_RENDER_WS_URL: string;
  readonly VITE_WS_API_KEY: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
