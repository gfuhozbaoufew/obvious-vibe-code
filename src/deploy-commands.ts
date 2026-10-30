import { REST, Routes } from "discord.js";
import { reencryptCommand } from "./command.js";
import { guideCommand } from "./guides.js";
import { initCommand } from "./panel.js";
import { updateCommand } from "./update.js";

// Load .env if present; panel environment variables work too.
try {
  process.loadEnvFile();
} catch {}

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  throw new Error("DISCORD_TOKEN and CLIENT_ID must be set (see .env.example)");
}

const rest = new REST().setToken(DISCORD_TOKEN);
const commands = [reencryptCommand, guideCommand, initCommand, updateCommand];
const body = commands.map((c) => c.toJSON());

// Guild commands update instantly; global ones can take up to an hour.
const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);

await rest.put(route, { body });
console.log(`Registered ${commands.map((c) => `/${c.name}`).join(", ")} ${GUILD_ID ? `in guild ${GUILD_ID}` : "globally"}`);
