// Entry point for hosts that run `node <main file>`: loads .env if present
// (panel environment variables work too), then runs the TypeScript source.
import { tsImport } from "tsx/esm/api";

try {
  process.loadEnvFile();
} catch {}

// Register slash commands on every start; a failure shouldn't keep the bot down.
try {
  await tsImport("./src/deploy-commands.ts", import.meta.url);
} catch (err) {
  console.error("Command deploy failed:", err);
}

await tsImport("./src/index.ts", import.meta.url);
