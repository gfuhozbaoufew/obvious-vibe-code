// Entry point for hosts that run `node <main file>`: loads .env if present
// (panel environment variables work too), then runs the TypeScript source.
import { tsImport } from "tsx/esm/api";

try {
  process.loadEnvFile();
} catch {}

await tsImport("./src/index.ts", import.meta.url);
