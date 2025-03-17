/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GOOGLE_CLIENT_ID: string;
    readonly VITE_GOOGLE_CLIENT_SECRET: string;
    readonly VITE_GOOGLE_REDIRECT_URI: string;
    // add more environment variables as needed
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }