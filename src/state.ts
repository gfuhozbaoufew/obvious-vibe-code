import { readFile, rename, writeFile } from "node:fs/promises";
import { GUIDES_DIR, ensureGuidesDir } from "./guides.js";

export interface PanelRef {
  channelId: string;
  messageId: string;
}

/** Bot state kept next to the guide files so it survives restarts. */
export interface BotState {
  /** Guide id -> ISO time of the last /update-guide. */
  updatedAt: Record<string, string>;
  /** Panel messages posted by /init-rxp, refreshed after an update. */
  panels: PanelRef[];
}

const STATE_FILE = new URL("state.json", GUIDES_DIR);

export async function loadState(): Promise<BotState> {
  try {
    const state = JSON.parse(await readFile(STATE_FILE, "utf-8"));
    return { updatedAt: state.updatedAt ?? {}, panels: state.panels ?? [] };
  } catch {
    return { updatedAt: {}, panels: [] };
  }
}

export async function saveState(state: BotState) {
  await ensureGuidesDir();
  const temp = new URL("state.json.tmp", GUIDES_DIR);
  await writeFile(temp, JSON.stringify(state, null, 2), "utf-8");
  await rename(temp, STATE_FILE);
}
