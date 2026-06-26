import crypto from "crypto";
import { TEAM } from "./team";

/** Verify a Slack request signature (HMAC over the raw body). */
export function verifySlack(
  raw: string,
  ts: string | null,
  sig: string | null,
): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return true; // allow early local testing without a secret
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false;
  const base = `v0:${ts}:${raw}`;
  const expected =
    "v0=" + crypto.createHmac("sha256", secret).update(base).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

/** Call a Slack Web API method with the bot token. */
export async function slackApi(
  method: string,
  payload: Record<string, unknown>,
  token = process.env.SLACK_BOT_TOKEN,
): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  if (!token) return { ok: false, error: "no_bot_token" };
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => ({ ok: false, error: "bad_response" }));
}

export function appUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

// The single "AI assist" toggle. Pre-checked so the default stays AI-cleaned.
const AI_ASSIST_OPTION = {
  text: { type: "plain_text", text: "✨ Let AI clean up & summarize my notes" },
  description: {
    type: "plain_text",
    text: "Untick to keep your exact words, just turned into bullet points.",
  },
  value: "ai",
};

/** The /presentation modal: teammate dropdown + a box per status. */
export function buildPresentationModal() {
  return {
    type: "modal",
    callback_id: "presentation_submit",
    title: { type: "plain_text", text: "Weekly Update" },
    submit: { type: "plain_text", text: "Save to deck" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "person",
        label: { type: "plain_text", text: "Who is this for?" },
        element: {
          type: "static_select",
          action_id: "person",
          placeholder: { type: "plain_text", text: "Pick a teammate" },
          options: TEAM.map((m) => ({
            text: { type: "plain_text", text: m.name },
            value: m.key,
          })),
        },
      },
      {
        type: "input",
        block_id: "delivered",
        optional: true,
        label: { type: "plain_text", text: "✅ Delivered" },
        element: {
          type: "plain_text_input",
          action_id: "v",
          multiline: true,
          placeholder: { type: "plain_text", text: "What you shipped this week…" },
        },
      },
      {
        type: "input",
        block_id: "in_review",
        optional: true,
        label: { type: "plain_text", text: "👀 In Testing / Review" },
        element: {
          type: "plain_text_input",
          action_id: "v",
          multiline: true,
          placeholder: { type: "plain_text", text: "What's in review or testing…" },
        },
      },
      {
        type: "input",
        block_id: "in_progress",
        optional: true,
        label: { type: "plain_text", text: "🔨 In Progress" },
        element: {
          type: "plain_text_input",
          action_id: "v",
          multiline: true,
          placeholder: { type: "plain_text", text: "What you're working on…" },
        },
      },
      {
        type: "input",
        block_id: "ai_assist",
        optional: true,
        label: { type: "plain_text", text: "Formatting" },
        element: {
          type: "checkboxes",
          action_id: "ai",
          initial_options: [AI_ASSIST_OPTION],
          options: [AI_ASSIST_OPTION],
        },
      },
    ],
  };
}
