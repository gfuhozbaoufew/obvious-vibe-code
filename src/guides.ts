import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type InteractionEditReplyOptions,
} from "discord.js";
import { BATTLETAG_RE } from "./command.js";
import { decryptGuideFile, encryptForBattletag } from "./rxp-crypto.js";

export interface GuideConfig {
  id: string;
  title: string;
  expansion: string;
  description: string;
  file: string;
  sourceTag: string;
}

/** Mirrors restedxp-reencrypt's lib/guides.ts; files live in guides/. */
export const GUIDES: GuideConfig[] = [
  { id: "midnight", title: "Midnight Leveling Guide (80-90)", expansion: "Midnight", description: "Latest expansion leveling guide for both factions.", file: "guide_midnight_player_1234.txt", sourceTag: "player#1234" },
  { id: "tbc", title: "TBC Speedrun Guide (1-70)", expansion: "The Burning Crusade", description: "Classic TBC speedrun guide for both Horde and Alliance.", file: "guide_tbc_player_1234.txt", sourceTag: "player#1234" },
  { id: "wotlk", title: "WotLK Leveling Guide (1-80)", expansion: "Wrath of the Lich King", description: "Full 1-80 leveling guide for both factions.", file: "guide_wotlk_player_1234.txt", sourceTag: "player#1234" },
  { id: "forever", title: "Forever Leveling Guide (1-60)", expansion: "WoW Forever", description: "1-60 leveling plus dungeon quest guides for both factions.", file: "guide_forever_player_1234.txt", sourceTag: "player#1234" },
  { id: "hardcore", title: "Hardcore & Speedrun Guides (Classic Era & SoD)", expansion: "Classic Era & Season of Discovery", description: "Hardcore survival and speedrun leveling guides for both factions.", file: "guide_hardcore_player_1234.txt", sourceTag: "player#1234" },
  { id: "speedrun", title: "Speedrun Leveling Guide (Classic Era & SoD)", expansion: "Classic Era & Season of Discovery", description: "Speedrun leveling and dungeon quest guides for both factions.", file: "guide_speedrun_player_1234.txt", sourceTag: "player#1234" },
];

// GUIDES_PATH overrides the folder the guide files are read from.
export const GUIDES_DIR = process.env.GUIDES_PATH
  ? pathToFileURL(path.resolve(process.env.GUIDES_PATH) + path.sep)
  : new URL("../guides/", import.meta.url);

/** Creates the guides folder if it's missing (e.g. on a fresh server). */
export async function ensureGuidesDir() {
  await mkdir(GUIDES_DIR, { recursive: true });
}

export function guideFileUrl(guide: GuideConfig, suffix = "") {
  return new URL(guide.file + suffix, GUIDES_DIR);
}

export const guideCommand = new SlashCommandBuilder()
  .setName("guide")
  .setDescription("Get one of the bundled RestedXP guides encrypted for your BattleTag")
  .addStringOption((o) =>
    o
      .setName("name")
      .setDescription("Which guide")
      .setRequired(true)
      .addChoices(...GUIDES.map((g) => ({ name: g.title, value: g.id }))),
  )
  .addStringOption((o) =>
    o
      .setName("tag")
      .setDescription("Your BattleTag, e.g. YourName#12345")
      .setRequired(true),
  );

export async function handleGuide(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("name", true);
  const tag = interaction.options.getString("tag", true).trim();

  // Ephemeral: BattleTags and the generated key are only visible to the caller.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return interaction.editReply(await guideReply(id, tag));
}

/** Encrypts a bundled guide for `tag`; shared by /guide and the panel form. */
export async function guideReply(
  id: string,
  tag: string,
): Promise<string | InteractionEditReplyOptions> {
  const guide = GUIDES.find((g) => g.id === id);
  if (!guide) {
    return `Unknown guide \`${id}\`.`;
  }
  if (!BATTLETAG_RE.test(tag)) {
    return `Invalid BattleTag \`${tag}\`. Format: Name#12345`;
  }

  const file = await readFile(guideFileUrl(guide), "utf-8").catch((err) => {
    if (err.code === "ENOENT") return null;
    throw err;
  });
  if (file === null) {
    return `**${guide.title}** isn't available yet — the bot owner needs to upload it with \`/update-guide\`.`;
  }
  const raw = file.trim();
  const { plaintext, version, guideCount } = decryptGuideFile(raw, guide.sourceTag);
  const output = encryptForBattletag(plaintext, tag, version);

  // Round-trip check: the new file must decrypt to the exact same guides.
  if (decryptGuideFile(output, tag).plaintext !== plaintext) {
    return "Re-encryption check failed — nothing was sent.";
  }

  const attachment = new AttachmentBuilder(Buffer.from(output, "utf-8"), {
    name: `guide_${guide.id}_${tag.replace("#", "_")}.txt`,
  });

  return {
    content: `${guide.title}: ${guideCount} guides encrypted for \`${tag}\`.`,
    files: [attachment],
  };
}
