interface ImportMetaEnv {
  readonly VITE_RENDER_WS_URL: string;
  readonly VITE_WS_API_KEY: string;
  readonly API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string;
    [key: string]: any;
  }
}
