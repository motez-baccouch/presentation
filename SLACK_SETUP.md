# Slack app setup — `/presentation`

This wires the `/presentation` slash command to your deployed app. Do this
**after** you've deployed to Vercel (you need the public URL).

> Slash commands require a public HTTPS URL, so the command only works against
> the deployed site (or a tunnel like ngrok), not `localhost`.

## 1. Create the app

1. Go to **https://api.slack.com/apps** → **Create New App** → **From scratch**.
2. Name it `Sigma Presentation` and pick your Sigma workspace.

## 2. Add the slash command

1. In the left sidebar → **Slash Commands** → **Create New Command**.
2. Fill in:
   - **Command:** `/presentation`
   - **Request URL:** `https://YOUR-APP.vercel.app/api/slack/command`
   - **Short description:** `Add your weekly update to the team deck`
   - **Usage hint:** `<name> <what you worked on>`
3. **Save**.

## 3. Get the signing secret

1. Left sidebar → **Basic Information** → **App Credentials**.
2. Copy the **Signing Secret**.
3. In **Vercel → your project → Settings → Environment Variables**, add:
   - `SLACK_SIGNING_SECRET` = the signing secret you copied.
   - `APP_URL` = `https://YOUR-APP.vercel.app` (used to build the edit link in
     Slack replies).
4. **Redeploy** so the new env vars take effect.

## 4. Install to the workspace

1. Left sidebar → **Install App** → **Install to Workspace** → **Allow**.

## 5. Use it

In any Slack channel or DM:

```
/presentation hayfa delivered the video call template tab, now optimizing slow log queries
```

- The first word is **who** the update is for (one of: `ali`, `wael`,
  `maytham`, `nour`, `motez`, `hassan`, `hayfa` — first names / surnames work
  too).
- Everything after is **what they worked on**, in plain language — type as much
  as you want.
- Groq AI fixes the grammar, figures out what's a role vs. actual tasks, and
  builds/updates that person's slide.
- You get back a link to tweak the slide in the editor, plus the present link.

### Post a team recap

```
/presentation summary
```

This regenerates the AI **status board** (In Progress / In Review / Released)
from everyone's slides and posts the recap **into the channel** so the whole
team sees it, with a link to present.

## Enable the `/presentation` form (interactivity)

Typing just `/presentation` (no text) opens a popup with a **teammate dropdown**
and three boxes — **✅ Delivered**, **👀 In Testing / Review**, **🔨 In Progress**.
This needs the bot token (below) plus interactivity turned on:

1. Slack app → **Interactivity & Shortcuts** → toggle **On**.
2. **Request URL:** `https://YOUR-APP.vercel.app/api/slack/interactivity` → **Save**.
3. Make sure the bot token + scopes from the next section are set (the form is
   opened and submitted using the bot token).

When someone submits the form, their slide is built (AI cleans the grammar and
files each box under its status) and they get a DM with the edit link. The
inline `/presentation <name> <text>` and `/presentation summary` still work too.

## Enable the "📣 Post to Slack" button (bot token)

The editor has a button that posts a rich weekly recap — with a picture of the
status board and a clickable button — into your **#weekly-updates** channel.
This needs a bot token (the signing secret alone isn't enough):

1. Slack app → **OAuth & Permissions** → **Scopes → Bot Token Scopes** → add
   **`chat:write`** (and **`chat:write.public`** if you'd rather not invite the
   bot to the channel).
2. **Install / Reinstall to Workspace** → copy the **Bot User OAuth Token**
   (starts with `xoxb-`).
3. In Vercel env vars add:
   - `SLACK_BOT_TOKEN` = the `xoxb-…` token
   - `SLACK_SUMMARY_CHANNEL` = `C0BD2B4S9TQ` (your #weekly-updates channel id)
4. In Slack, invite the bot to the channel: in **#weekly-updates** type
   `/invite @Sigma Presentation` (skip if you added `chat:write.public`).
5. Redeploy. Now the **📣 Post to Slack** button in the editor posts the recap.

## Troubleshooting

- **The command replied with a wall of HTML / the whole webpage:** the slash
  command **Request URL** is wrong — it must end in **`/api/slack/command`**,
  not just your domain. Fix it under **Slash Commands → /presentation**, save,
  and try again.

- **"dispatch_failed" / timeout in Slack:** the function took >3s to ack. The
  app acks immediately and does AI work in the background, so this usually means
  a cold start — try again.
- **"bad signature" (401):** `SLACK_SIGNING_SECRET` is missing or wrong in
  Vercel, or the request URL doesn't exactly match. Re-copy the secret and
  redeploy.
- **"I don't recognise …":** the first word didn't match a teammate. Edit the
  roster in [`src/lib/team.ts`](src/lib/team.ts) to add names/aliases.
