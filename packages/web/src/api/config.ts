// Base du backend MCP / HF Space. Surchargée par environnement via VITE_API_BASE
// (Cloudflare Pages : Production -> Space prod, Preview -> Space dev). Sans
// override, on retombe sur la prod. Vite expose toute var d'env préfixée
// VITE_ présente au build, donc les env vars Cloudflare sont bien injectées.
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://qdonnars-openwind-mcp.hf.space";
