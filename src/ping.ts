import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { isBotOwner } from "./panel.js";

export const pingCommand = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Check that the bot is running (bot owner only)")
  // Hidden from non-admins in the command list; the owner check is the real gate.
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

export async function handlePing(interaction: ChatInputCommandInteraction) {
  const content = (await isBotOwner(interaction))
    ? "running"
    : "Only the bot owner can use this command.";
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
