import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  DiscordAPIError,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  Team,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Message,
  type ModalSubmitInteraction,
} from "discord.js";
import { GUIDES, guideReply } from "./guides.js";
import { loadState, saveState, type BotState, type PanelRef } from "./state.js";

export const PANEL_BUTTON_ID = "rxp-panel:open";
export const GUIDE_FORM_ID = "rxp-panel:form";
const TAG_INPUT_ID = "tag";
const GUIDE_SELECT_ID = "guide";

export const initCommand = new SlashCommandBuilder()
  .setName("init-rxp")
  .setDescription("Post the RestedXP guide panel in this channel (bot owner only)")
  // Hidden from non-admins in the command list; the owner check below is the real gate.
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

export async function isBotOwner(interaction: ChatInputCommandInteraction) {
  const { owner } = await interaction.client.application.fetch();
  if (owner instanceof Team) return owner.members.has(interaction.user.id);
  return owner?.id === interaction.user.id;
}

export async function handleInit(interaction: ChatInputCommandInteraction) {
  if (!(await isBotOwner(interaction))) {
    return interaction.reply({
      content: "Only the bot owner can use this command.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const state = await loadState();
  const panel = buildPanel(state);

  const channel = await interaction.client.channels
    .fetch(interaction.channelId)
    .catch(() => null);
  const message = channel?.isSendable()
    ? // Missing permissions in this channel: fall back to replying below.
      await channel.send(panel).catch(() => null)
    : null;
  if (message) {
    await rememberPanel(state, message);
    const pinned = await message.pin().then(
      () => true,
      () => false,
    );
    return interaction.reply({
      content: pinned
        ? "Guide panel posted and pinned."
        : "Guide panel posted, but I couldn't pin it — give me the **Pin Messages** permission in this channel.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // The bot isn't a member here or can't send messages: post the panel as the
  // command reply instead, which needs no channel permissions.
  const response = await interaction.reply({ ...panel, withResponse: true });
  if (response.resource?.message) await rememberPanel(state, response.resource.message);
  return interaction.followUp({
    content:
      "I can't post in this channel myself, so the panel was posted as a reply. " +
      "It won't show update times after `/update-guide` until I'm added to this server " +
      "with the `bot` scope and can see this channel.",
    flags: MessageFlags.Ephemeral,
  });
}

function buildPanel({ updatedAt }: BotState) {
  const embed = new EmbedBuilder()
    .setTitle("RestedXP Guides")
    .setDescription(
      "Press **Get guide**, enter your BattleTag and pick a guide. " +
        "You get a file encrypted for your BattleTag that only you can see.",
    )
    .addFields(
      GUIDES.map((g) => {
        // <t:…:f> renders in each viewer's own timezone and language.
        const time = updatedAt[g.id] && Math.floor(Date.parse(updatedAt[g.id]) / 1000);
        return {
          name: g.title,
          value: `${time ? `Updated <t:${time}:f>\n` : ""}*${g.expansion}*\n${g.description}`,
        };
      }),
    );

  const button = new ButtonBuilder()
    .setCustomId(PANEL_BUTTON_ID)
    .setLabel("Get guide")
    .setStyle(ButtonStyle.Primary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}

async function rememberPanel(state: BotState, message: Message) {
  state.panels.push({ channelId: message.channelId, messageId: message.id });
  await saveState(state);
}

/** Re-renders every posted panel and reports how many were edited or failed. */
export async function refreshPanels(client: Client) {
  const state = await loadState();
  const panel = buildPanel(state);
  const kept: PanelRef[] = [];
  let edited = 0;
  let failed = 0;

  for (const ref of state.panels) {
    try {
      const channel = await client.channels.fetch(ref.channelId);
      if (!channel?.isTextBased()) continue;
      const message = await channel.messages.edit(ref.messageId, panel);
      // Keep the panel pinned, e.g. if someone unpinned it.
      if (!message.pinned) {
        await message
          .pin()
          .catch(() => console.warn(`Can't pin panel ${ref.messageId}: missing Pin Messages permission.`));
      }
      edited++;
      kept.push(ref);
    } catch (err) {
      // Deleted panel or channel: forget it. Other errors (e.g. the bot isn't
      // a member of that server yet) keep it so the next update tries again.
      if (err instanceof DiscordAPIError && (err.code === 10003 || err.code === 10008)) continue;
      failed++;
      kept.push(ref);
      if (err instanceof DiscordAPIError && (err.code === 50001 || err.code === 50013)) {
        console.warn(`Can't refresh panel ${ref.messageId}: no access to channel ${ref.channelId}.`);
      } else {
        console.error(`Couldn't refresh panel ${ref.messageId}:`, err);
      }
    }
  }

  if (kept.length !== state.panels.length) {
    await saveState({ ...state, panels: kept });
  }
  return { edited, failed };
}

export function openGuideForm(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId(GUIDE_FORM_ID)
    .setTitle("RXP")
    .addLabelComponents(
      (label) =>
        label.setLabel("Battle Net Tag").setTextInputComponent((input) =>
          input
            .setCustomId(TAG_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Example: YourName#12345")
            .setRequired(true)
            .setMaxLength(64),
        ),
      (label) =>
        label.setLabel("Guide").setStringSelectMenuComponent((select) =>
          select
            .setCustomId(GUIDE_SELECT_ID)
            .setPlaceholder("Choose your guide")
            .setRequired(true)
            .addOptions(
              GUIDES.map((g) => ({ label: g.title, description: g.expansion, value: g.id })),
            ),
        ),
    );

  return interaction.showModal(modal);
}

export async function handleGuideForm(interaction: ModalSubmitInteraction) {
  const tag = interaction.fields.getTextInputValue(TAG_INPUT_ID).trim();
  const [id] = interaction.fields.getStringSelectValues(GUIDE_SELECT_ID);

  // Ephemeral: BattleTags and the generated key are only visible to the caller.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return interaction.editReply(await guideReply(id, tag));
}
