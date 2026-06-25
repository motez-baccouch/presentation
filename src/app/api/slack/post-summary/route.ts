import { NextResponse } from "next/server";
import { generateSummary, summaryToText } from "@/lib/summary";
import { buildSummarySlide } from "@/lib/templates";
import { upsertSummarySlide, getPresentation } from "@/lib/db";
import { formatToday } from "@/lib/date";

export const dynamic = "force-dynamic";

function appUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req: Request) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_SUMMARY_CHANNEL || "C0BD2B4S9TQ";
  if (!token) {
    return NextResponse.json(
      {
        error:
          "Slack bot token not set. Add SLACK_BOT_TOKEN (and optionally SLACK_SUMMARY_CHANNEL) in your env, then redeploy.",
        needsSetup: true,
      },
      { status: 400 },
    );
  }

  // Refresh the AI summary slide so the deck and the message match.
  const items = await generateSummary();
  await upsertSummarySlide(buildSummarySlide(items, formatToday()));

  const deck = await getPresentation();
  const summaryIdx = deck.slides.findIndex((s) => s.type === "SUMMARY");
  const base = appUrl(req);
  const presentUrl = `${base}/present?slide=${summaryIdx >= 0 ? summaryIdx : 0}`;
  const imageUrl = `${base}/api/og/summary?t=${Date.now()}`;
  const recap = summaryToText(items) || "No updates yet.";

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "📊 This Week at Sigma", emoji: true },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `*${formatToday()}* · Sigma Lending dev team` }],
    },
    { type: "section", text: { type: "mrkdwn", text: recap } },
    {
      type: "image",
      image_url: imageUrl,
      alt_text: "This week's Sigma status board",
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "▶ Open the deck", emoji: true },
          url: presentUrl,
          style: "primary",
        },
      ],
    },
  ];

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      text: "📊 This Week at Sigma — team update",
      blocks,
      unfurl_links: false,
    }),
  });
  const data = await res.json().catch(() => ({}));

  if (!data.ok) {
    const hint =
      data.error === "not_in_channel"
        ? "The bot isn't in that channel. In Slack, run `/invite @your-app` in #weekly-updates, then try again."
        : data.error === "channel_not_found"
          ? "Channel not found — check SLACK_SUMMARY_CHANNEL."
          : `Slack error: ${data.error ?? "unknown"}`;
    return NextResponse.json({ error: hint, slack: data.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, channel });
}
