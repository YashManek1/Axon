/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend REST API base URL (e.g. "http://localhost:3000" or "https://api.your-domain.com") */
  readonly VITE_API_BASE_URL: string;
  /** Socket.IO server URL — usually the same as VITE_API_BASE_URL */
  readonly VITE_SOCKET_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.css" {
  const content: string;
  export default content;
}
