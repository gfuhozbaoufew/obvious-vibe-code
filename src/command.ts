import {
  AttachmentBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { decryptGuideFile, encryptForBattletag } from "./rxp-crypto.js";

export const BATTLETAG_RE = /^.+#\d+$/;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const reencryptCommand = new SlashCommandBuilder()
  .setName("reencrypt")
  .setDescription("Re-encrypt a RestedXP guide export for another BattleTag")
  .addAttachmentOption((o) =>
    o
      .setName("file")
      .setDescription("The RestedXP guide export (.txt)")
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName("new_tag")
      .setDescription("BattleTag to encrypt for, e.g. YourName#12345")
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName("creator_tag")
      .setDescription(
        "BattleTag the file was exported with (read from the file name if omitted)",
      ),
  )
  // Hidden from non-admins in the command list; checked again in the handler.
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

/** RXP export names look like "Guide Name!Creator#1234.txt". */
function tagFromFileName(name: string): string | null {
  const match = name.match(/!([^(]+?)\s*(?:\(\d+\))?\.txt$/i);
  return match ? match[1].trim() : null;
}

export async function handleReencrypt(interaction: ChatInputCommandInteraction) {
  // Server admins can re-enable the command for others in Integrations settings,
  // so the permission is enforced here too.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "Only server admins can use this command.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const file = interaction.options.getAttachment("file", true);
  const newTag = interaction.options.getString("new_tag", true).trim();
  const creatorTag =
    interaction.options.getString("creator_tag")?.trim() ??
    tagFromFileName(file.name);

  // Ephemeral: BattleTags and the generated key are only visible to the caller.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!creatorTag) {
    return interaction.editReply(
      "Couldn't read the creator BattleTag from the file name — pass it with `creator_tag`.",
    );
  }
  if (!BATTLETAG_RE.test(creatorTag)) {
    return interaction.editReply(
      `Invalid creator BattleTag \`${creatorTag}\`. Format: Name#12345`,
    );
  }
  if (!BATTLETAG_RE.test(newTag)) {
    return interaction.editReply(
      `Invalid new BattleTag \`${newTag}\`. Format: Name#12345`,
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

  const output = encryptForBattletag(plaintext, newTag, version);

  // Round-trip check: the new file must decrypt to the exact same guides.
  if (decryptGuideFile(output, newTag).plaintext !== plaintext) {
    return interaction.editReply("Re-encryption check failed — nothing was sent.");
  }

  const base = file.name.replace(/(![^!]*)?\.txt$/i, "") || "guide";
  const attachment = new AttachmentBuilder(Buffer.from(output, "utf-8"), {
    name: `${base}_${newTag.replace("#", "_")}.txt`,
  });

  return interaction.editReply({
    content: `${guideCount} guides re-encrypted from \`${creatorTag}\` for \`${newTag}\`.`,
    files: [attachment],
  });
}
