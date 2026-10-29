# RXP Re-Encrypt Bot

> The re-encryption code and the Midnight, TBC and WotLK guides come from
> [mkccl/restedxp-reencrypt](https://github.com/mkccl/restedxp-reencrypt). This
> project just converts that web app into a Discord bot; the conversion was
> written with Claude.

Discord bot that hands out RestedXP guides encrypted for a user's BattleTag, and
re-encrypts RestedXP guide exports for another BattleTag.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/init-rxp` | Bot owner | Posts the guide panel in the channel |
| `/update-guide` | Bot owner | Replaces a bundled guide with a new export |
| `/reencrypt` | Server admins | Re-encrypts any RestedXP export |
| `/guide` | Everyone | Sends a bundled guide for your BattleTag |

"Bot owner" is the owner of the application in the Discord Developer Portal (or
any member of its team). "Server admins" are members with the Administrator
permission. The owner and admin commands are hidden from members without
Administrator, and checked again when they run: other admins can see the owner
commands but get "Only the bot owner can use this command."

Every reply that contains a BattleTag or a guide file is ephemeral: only the
person who used the command sees it.

### `/init-rxp`

Posts a panel listing the bundled guides with their expansion and description,
and a **Get guide** button. The button opens a form with a BattleTag field and a
guide dropdown; submitting it replies with the encrypted file.

Run it once per channel. The panel is pinned, and pinned again on every
`/update-guide` if someone unpinned it. If the bot isn't a member of the server
or can't post in the channel, it posts the panel as the command reply instead
and warns you that this panel won't show update times or be pinned (see
[Inviting the bot](#inviting-the-bot)).

### `/update-guide`

```
/update-guide guide:<guide> file:<export.txt> creator_tag:Creator#1234
```

- `guide` – which bundled guide to replace
- `file` – the new RestedXP export
- `creator_tag` – the BattleTag the file was exported with

The file is decrypted, re-encrypted for the bundled guides' tag (`player#1234`)
and checked to decrypt to exactly the same guides before anything is replaced.
The previous file is kept as `<file>.bak`. Every panel posted by `/init-rxp` is
then edited to show the guide's update time, in each viewer's own timezone. The
reply tells you how many panels were refreshed and how many the bot couldn't
reach.

The new guide is served right away; no restart is needed.

### `/reencrypt`

```
/reencrypt file:<export.txt> new_tag:YourName#12345 [creator_tag:Creator#1234]
```

- `file` – the RestedXP export the creator shared
- `new_tag` – the BattleTag the new file should work for
- `creator_tag` – the BattleTag the file was exported with. Optional if the file
  name still has the `Guide!Creator#1234.txt` form RestedXP gives it.

Replies with the new `.txt` file after checking that it decrypts to exactly the
same guides. Nothing is stored.

### `/guide`

```
/guide name:<guide> tag:YourName#12345
```

Sends one of the bundled guides (Midnight, TBC, WotLK, Forever, Hardcore and
Speedrun) encrypted for your BattleTag. Same result as the panel button.

## Setup

### 1. Create the bot

Create an application at https://discord.com/developers/applications, add a bot,
and copy its token and the application ID. No privileged intents are needed.

To make sure only you can add the bot to servers:

1. **Installation**: set **Install Link** to **None** and, under Installation
   Contexts, keep only **Guild Install**.
2. **Bot**: turn off **Public Bot**. (Discord refuses this while an install link
   is set, hence step 1.)

### 2. Inviting the bot

In **OAuth2 → URL Generator**:

- Integration type: **Guild Install** (not User Install — the bot has to be a
  server member to post and edit the panel)
- Scopes: `bot` and `applications.commands`
- Permissions: **View Channels**, **Send Messages**, **Embed Links** and **Pin
  Messages** (the panel is pinned)

Or use this link with your application ID (with Public Bot off, it only works
for you):

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=2251799813704704
```

If a channel has its own permission overrides, make sure the bot's role can view
and send messages there.

### 3. Configure

```sh
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | yes | Bot token |
| `CLIENT_ID` | for `npm run deploy` | Application ID |
| `GUILD_ID` | no | Register commands in this server only (shows up instantly) instead of globally |
| `GUIDES_PATH` | no | Folder with the guide files (default: `guides/`) |

For `npm start` / `main.js`, `.env` is optional when the host sets these as
environment variables instead. `npm run deploy` always reads `.env`, so run it
where you have one (e.g. your own PC).

### 4. Add the guide files

The guide files are **not in git**. Put them into `guides/` with exactly the
names in the left column (case matters on Linux):

| File in `guides/` | Source in [restedxp-reencrypt/public](https://github.com/mkccl/restedxp-reencrypt/tree/main/public) |
|---|---|
| `guide_midnight_player_1234.txt` | [`guide_player_1234.txt`](https://github.com/mkccl/restedxp-reencrypt/blob/main/public/guide_player_1234.txt) — rename it |
| `guide_tbc_player_1234.txt` | [`guide_tbc_player_1234.txt`](https://github.com/mkccl/restedxp-reencrypt/blob/main/public/guide_tbc_player_1234.txt) |
| `guide_wotlk_player_1234.txt` | [`guide_wotlk_player_1234.txt`](https://github.com/mkccl/restedxp-reencrypt/blob/main/public/guide_wotlk_player_1234.txt) |
| `guide_forever_player_1234.txt` | not in the public repo |
| `guide_hardcore_player_1234.txt` | not in the public repo |
| `guide_speedrun_player_1234.txt` | not in the public repo |

For the guides that aren't in the public repo, or to start with an empty folder,
upload each guide from Discord with `/update-guide`. Until a guide exists, the
bot replies that it isn't available yet.

### 5. Install, register commands and run

```sh
npm install
npm run deploy   # register the slash commands
npm start        # runs node main.js
```

Run `npm run deploy` once, and again whenever a command or its options change.
Changes to what a command does only need a restart. Global commands can take a
few minutes to show up; press Ctrl+R in Discord to reload.

If you register with `GUILD_ID` after registering globally, the commands show up
twice in that server. Use one or the other.

## Hosting

- **Node.js 20.12 or newer.**
- Hosts that ask for a **main file**: use `main.js`. It loads `.env` if present
  and runs the TypeScript source through `tsx`, so no build step is needed.
- Run `npm install` **on the server**. Don't copy `node_modules` from another
  OS: `tsx` depends on `esbuild`, which installs a platform-specific binary.
- The bot needs write access to `guides/` (for `/update-guide` and
  `state.json`). The folder is created at startup if it's missing.
- Unexpected errors are logged and don't stop the bot. An invalid token stops it
  with `Login failed` and exit code 1.

## Files the bot writes

All in `guides/` (or `GUIDES_PATH`), all ignored by git:

| File | Content |
|---|---|
| `guide_*.txt` | The bundled guides |
| `guide_*.txt.bak` | The previous version of a guide, written by `/update-guide` |
| `state.json` | Where panels were posted and when each guide was last updated |

Back up this folder when moving the bot to another server. Without
`state.json`, existing panels are no longer updated; run `/init-rxp` again.

## Development

```sh
npm run typecheck
```

| File | Purpose |
|---|---|
| `src/index.ts` | Client setup and interaction routing |
| `src/command.ts` | `/reencrypt` |
| `src/guides.ts` | Guide list, `/guide`, guide file access |
| `src/panel.ts` | `/init-rxp`, panel, button and form, panel refresh |
| `src/update.ts` | `/update-guide` |
| `src/state.ts` | `state.json` load and save |
| `src/rxp-crypto.ts` | RestedXP encryption |
| `src/deploy-commands.ts` | Registers the slash commands |

`src/rxp-crypto.ts` is copied from
[restedxp-reencrypt](https://github.com/mkccl/restedxp-reencrypt)'s
`lib/rxp-crypto.ts`; keep the two in sync. The Midnight, TBC and WotLK entries
in `src/guides.ts` mirror its `lib/guides.ts`; Forever, Hardcore and Speedrun
were added here.
