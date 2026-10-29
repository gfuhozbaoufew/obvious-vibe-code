import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { handleReencrypt, reencryptCommand } from "./command.js";
import { ensureGuidesDir, guideCommand, handleGuide } from "./guides.js";
import {
  GUIDE_FORM_ID,
  PANEL_BUTTON_ID,
  handleGuideForm,
  handleInit,
  initCommand,
  openGuideForm,
} from "./panel.js";
import { handleUpdate, updateCommand } from "./update.js";

const handlers: Record<string, (i: ChatInputCommandInteraction) => Promise<unknown>> = {
  [reencryptCommand.name]: handleReencrypt,
  [guideCommand.name]: handleGuide,
  [initCommand.name]: handleInit,
  [updateCommand.name]: handleUpdate,
};

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is not set (see .env.example)");

await ensureGuidesDir().catch((err) => console.error("Couldn't create the guides folder:", err));

// Log unexpected errors instead of letting them stop the bot.
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on(Events.Error, (err) => console.error("Discord client error:", err));

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  let run: (() => Promise<unknown>) | undefined;
  if (interaction.isChatInputCommand()) {
    const handler = handlers[interaction.commandName];
    if (handler) run = () => handler(interaction);
  } else if (interaction.isButton() && interaction.customId === PANEL_BUTTON_ID) {
    run = () => openGuideForm(interaction);
  } else if (interaction.isModalSubmit() && interaction.customId === GUIDE_FORM_ID) {
    run = () => handleGuideForm(interaction);
  }
  if (!run || !interaction.isRepliable()) return;

  try {
    await run();
  } catch (err) {
    console.error(err);
    const message = "Something went wrong while re-encrypting.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => {});
    } else {
      await interaction
        .reply({ content: message, flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
});

// A bad token can't recover, so stop with an error instead of idling.
client.login(token).catch((err) => {
  console.error("Login failed:", err.message);
  process.exit(1);
});
