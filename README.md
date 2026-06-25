# Sigma Presentation Studio

A custom, on-brand presentation editor for the **Sigma Lending** dev team — a
Canva-style studio for the weekly team update, driven by a Slack command.

A teammate types `/presentation hayfa <what they worked on>` in Slack. Groq AI
cleans the grammar, works out what's a role vs. actual tasks, and builds or
updates that person's slide. Anyone can then tweak it in the browser (text,
fonts, colours, images, drag/resize, reorder) and play it back as an animated
presentation.

## Features

- 🎤 **Slack `/presentation <name> <text>`** → AI-formatted slide, auto-created/updated.
- 🧮 **Slack `/presentation summary`** → AI **status board** (In Progress /
  In Review / Released) built from everyone's work, posted as a channel recap.
- ✨ **Groq AI** everywhere — fix grammar, and an **AI assist prompt** in the
  editor (Improve / Shorten / Expand / Professional / or type your own
  instruction) that rewrites the selected text.
- 🪄 **`/presentation` form** in Slack — a popup with a teammate dropdown and
  Delivered / In Review / In Progress boxes; AI files each under its status.
- 🎨 **On-brand editor** — inline text editing, fonts/size/weight/colour, image
  **and video** upload + drag/resize, shapes, per-slide backgrounds, reorder,
  add/duplicate/delete, live "who's editing" presence, and one-click
  "✨ AI summary" + "📣 Post to Slack".
- ▶️ **Present mode** — fullscreen edge-to-edge, animated transitions + bullet
  reveals, floating brand orbs, top progress bar, **auto-play loop**, keyboard
  nav (`→`/`←`/`space`, `F`), and a **confetti** finish on the thank-you slide.
- 🔒 **Shared-password access** for editing; viewing/presenting is open.
- 🌱 Seeded with the real Sigma deck — branded title (individual avatars + logo +
  date), 7 teammates, AI status board, thank-you.

## Tech

Next.js 16 (App Router) · React 19 · Tailwind v4 · Framer Motion · Prisma 6 +
Neon Postgres · Vercel Blob · Groq · react-rnd / dnd-kit.

## Run locally

```bash
npm install
npx prisma generate
npm run dev          # http://localhost:3000
```

**Zero config:** with no `DATABASE_URL` / `BLOB_READ_WRITE_TOKEN` set, the app
falls back to a local JSON store (`.data/deck.json`) and saves uploads into
`/public/uploads`. The default editor password is `sigma`.

The provided Groq key already lives in `.env.local` (gitignored) so AI works
out of the box. **Rotate that key before going live** — it was shared in plain
text during setup. See `.env.example` for all variables.

## Deploy to Vercel

1. **Push to GitHub** and import the repo in Vercel.
2. **Database — Neon:** Vercel project → **Storage** → **Create** → **Neon**.
   It sets `DATABASE_URL` for you. Then run the migration once:
   ```bash
   npx prisma migrate deploy        # or: npx prisma db push
   ```
   (run locally with the Neon `DATABASE_URL`, or via a Vercel build step).
   The deck self-seeds on first load.
3. **Images — Vercel Blob:** Storage → **Create** → **Blob**. It sets
   `BLOB_READ_WRITE_TOKEN`.
4. **Environment variables** (Vercel → Settings → Environment Variables):
   | Var | Value |
   |-----|-------|
   | `GROQ_API_KEY` | your Groq key (rotated) |
   | `GROQ_MODEL` | `llama-3.3-70b-versatile` |
   | `EDIT_PASSWORD` | the shared team password |
   | `AUTH_COOKIE_SECRET` | a long random string |
   | `SLACK_SIGNING_SECRET` | from the Slack app (see below) |
   | `APP_URL` | `https://your-app.vercel.app` |

   (`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` are added by the Storage step.)
5. **Redeploy.**

## Slack command

See **[SLACK_SETUP.md](SLACK_SETUP.md)** for the step-by-step. Summary: create a
Slack app → add a `/presentation` slash command pointing at
`https://your-app.vercel.app/api/slack/command` → set `SLACK_SIGNING_SECRET` and
`APP_URL` in Vercel → install to the workspace.

## Project structure

```
src/
  app/
    page.tsx                 landing + deck overview
    present/                 fullscreen animated playback
    edit/                    password-gated editor
    login/                   shared-password gate
    api/
      slack/command/         slash-command handler (verify -> AI -> upsert)
      slides/ ...            slide CRUD + reorder
      ai/ ...                grammar / reformat (Groq)
      upload/                image upload (Vercel Blob / local)
      auth/login/            session cookie
  components/
    stage/                   SlideView, StageScaler, element renderers
    editor/                  Editor, SlideRail, EditorCanvas, Inspector
    Presenter.tsx            present mode
  lib/
    types.ts                 slide document model (1280x720 stage)
    templates.ts             on-brand slide builders
    team.ts                  the roster (edit to add teammates)
    seed-data.ts             default deck content
    db.ts                    Prisma + JSON-file fallback store
    groq.ts                  AI helpers
    auth.ts                  shared-password session
```

## Editing the team

The roster lives in [`src/lib/team.ts`](src/lib/team.ts) — add a member with a
`key`, `name`, default `role`, `avatar` (put the image in `/public/avatars`),
and `accent` colour. Slack name-matching and avatars pick it up automatically.
