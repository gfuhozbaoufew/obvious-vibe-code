import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { BATTLETAG_RE, MAX_FILE_BYTES } from "./command.js";
import { GUIDES, ensureGuidesDir, guideFileUrl } from "./guides.js";
import { isBotOwner, refreshPanels } from "./panel.js";
import { decryptGuideFile, encryptForBattletag } from "./rxp-crypto.js";
import { loadState, saveState } from "./state.js";

export const updateCommand = new SlashCommandBuilder()
  .setName("update-guide")
  .setDescription("Replace a bundled guide with a new RestedXP export (bot owner only)")
  .addStringOption((o) =>
    o
      .setName("guide")
      .setDescription("Which bundled guide to replace")
      .setRequired(true)
      .addChoices(...GUIDES.map((g) => ({ name: g.title, value: g.id }))),
  )
  .addAttachmentOption((o) =>
    o
      .setName("file")
      .setDescription("The new RestedXP export (.txt)")
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName("creator_tag")
      .setDescription("BattleTag the file was exported with, e.g. Creator#1234")
      .setRequired(true),
  )
  // Hidden from non-admins in the command list; the owner check is the real gate.
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

export async function handleUpdate(interaction: ChatInputCommandInteraction) {
  if (!(await isBotOwner(interaction))) {
    return interaction.reply({
      content: "Only the bot owner can use this command.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const id = interaction.options.getString("guide", true);
  const file = interaction.options.getAttachment("file", true);
  const creatorTag = interaction.options.getString("creator_tag", true).trim();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guide = GUIDES.find((g) => g.id === id);
  if (!guide) {
    return interaction.editReply(`Unknown guide \`${id}\`.`);
  }
  if (!BATTLETAG_RE.test(creatorTag)) {
    return interaction.editReply(
      `Invalid creator BattleTag \`${creatorTag}\`. Format: Name#12345`,
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return interaction.editReply("That file is too large to be a guide export.");
  }

  const res = await fetch(file.url);
  if (!res.ok) {
    return interaction.editReply(`Couldn't download the file (HTTP ${res.status}).`);
  }
  const raw = (await res.text()).trim();

  let plaintext: string, version: number, guideCount: number;
  try {
    ({ plaintext, version, guideCount } = decryptGuideFile(raw, creatorTag));
  } catch {
    return interaction.editReply(
      `Couldn't decrypt the file with \`${creatorTag}\`. Is that the BattleTag it was exported with?`,
    );
  }
  if (guideCount === 0) {
    return interaction.editReply(
      "No guides found — that doesn't look like a RestedXP export.",
    );
  }

  // Bundled guides are stored encrypted for their sourceTag, like the originals.
  const output = encryptForBattletag(plaintext, guide.sourceTag, version);
  if (decryptGuideFile(output, guide.sourceTag).plaintext !== plaintext) {
    return interaction.editReply("Re-encryption check failed — the guide was not changed.");
  }

  const target = guideFileUrl(guide);
  const oldCount = await readFile(target, "utf-8")
    .then((old) => decryptGuideFile(old.trim(), guide.sourceTag).guideCount)
    .catch(() => null);

  // Keep the previous file as .bak, and swap the new one in atomically.
  const backedUp = await copyFile(target, guideFileUrl(guide, ".bak")).then(
    () => true,
    () => false,
  );
  await ensureGuidesDir();
  const temp = guideFileUrl(guide, ".tmp");
  await writeFile(temp, output, "utf-8");
  await rename(temp, target);

  const state = await loadState();
  state.updatedAt[guide.id] = new Date().toISOString();
  await saveState(state);
  const { edited, failed } = await refreshPanels(interaction.client);

  const before = oldCount === null ? "" : ` (was ${oldCount})`;
  const backup = backedUp ? ` The previous file is kept as \`${guide.file}.bak\`.` : "";
  const notRefreshed = failed
    ? ` ${failed} couldn't be refreshed — I'm not a member of that server or can't see the channel.`
    : "";
  return interaction.editReply(
    `**${guide.title}** updated: ${guideCount} guides${before}, from \`${creatorTag}\`.${backup}\n` +
      `Refreshed ${edited} guide panel${edited === 1 ? "" : "s"}.${notRefreshed}`,
  );
}
