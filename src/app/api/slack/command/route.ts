import { NextResponse, after } from "next/server";
import { findMember, TEAM } from "@/lib/team";
import { formatUpdate } from "@/lib/groq";
import { buildPersonSlides, buildSummarySlide } from "@/lib/templates";
import { upsertPersonSlides, upsertSummarySlide } from "@/lib/db";
import { generateSummary, summaryToText } from "@/lib/summary";
import { formatToday } from "@/lib/date";
import {
  verifySlack,
  slackApi,
  appUrl,
  buildPresentationModal,
} from "@/lib/slack";

export const runtime = "nodejs";

const SUMMARY_WORDS = ["summary", "recap", "board", "overview"];

async function respond(responseUrl: string, text: string, inChannel = false) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      response_type: inChannel ? "in_channel" : "ephemeral",
      text,
    }),
  }).catch(() => {});
}

export async function POST(req: Request) {
  const raw = await req.text();
  const ts = req.headers.get("x-slack-request-timestamp");
  const sig = req.headers.get("x-slack-signature");
  if (!verifySlack(raw, ts, sig)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const params = new URLSearchParams(raw);
  const text = (params.get("text") || "").trim();
  const responseUrl = params.get("response_url") || "";
  const triggerId = params.get("trigger_id") || "";
  const base = appUrl(req);
  const names = TEAM.map((m) => m.key).join(", ");

  // No text → open the interactive form (needs the bot token).
  if (!text) {
    if (process.env.SLACK_BOT_TOKEN && triggerId) {
      const r = await slackApi("views.open", {
        trigger_id: triggerId,
        view: buildPresentationModal(),
      });
      if (r.ok) return new NextResponse(null, { status: 200 });
    }
    return NextResponse.json({
      response_type: "ephemeral",
      text: `Usage:\n• \`/presentation\` — opens a form (needs the bot token set up)\n• \`/presentation <name> <what you worked on>\`\n• \`/presentation summary\` — post this week's recap\nNames: ${names}`,
    });
  }

  // First token is the person; the rest is their free-text update.
  const firstSpace = text.indexOf(" ");
  const nameToken = firstSpace === -1 ? text : text.slice(0, firstSpace);
  const body = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();

  // `/presentation summary` → regenerate the board and post the recap.
  if (SUMMARY_WORDS.includes(nameToken.toLowerCase())) {
    if (responseUrl) {
      after(async () => {
        try {
          const items = await generateSummary();
          await upsertSummarySlide(buildSummarySlide(items, formatToday()));
          const recap = summaryToText(items);
          await respond(
            responseUrl,
            `*This week at Sigma* — ${formatToday()}\n\n${recap || "No updates yet."}\n\n▶️ Present: ${base}/present`,
            true,
          );
        } catch (err) {
          await respond(responseUrl, "⚠️ Couldn't build the summary. Try again.");
          console.error("slack summary error", err);
        }
      });
    }
    return NextResponse.json({
      response_type: "ephemeral",
      text: "🧮 Building this week's team summary…",
    });
  }

  const member = findMember(nameToken);
  if (!member) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: `I don't recognise "*${nameToken}*". Try \`/presentation\` for the form, or one of: ${names}`,
    });
  }

  if (!body) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: `Add what *${member.name}* worked on, e.g. \`/presentation ${member.key} finished the open banking PR, fixed the plaid bug\` — or just \`/presentation\` for the form.`,
    });
  }

  if (responseUrl) {
    after(async () => {
      try {
        const formatted = await formatUpdate(member.name, body);
        const documents = buildPersonSlides(member, {
          role: formatted.role ?? member.role,
          eyebrow: formatted.eyebrow ?? undefined,
          tasks: formatted.tasks,
        });
        await upsertPersonSlides(member.key, documents);
        const link = `${base}/edit?slide=${member.key}`;
        const bulletList = formatted.tasks
          .map((t) => `  • ${t.title}`)
          .join("\n");
        await respond(
          responseUrl,
          `✅ Updated *${member.name}*'s slide:\n${bulletList}\n\n✏️ Tweak it: ${link}\n▶️ Present: ${base}/present`,
        );
      } catch (err) {
        await respond(
          responseUrl,
          `⚠️ Something went wrong building ${member.name}'s slide. Please try again.`,
        );
        console.error("slack command error", err);
      }
    });
  }

  return NextResponse.json({
    response_type: "ephemeral",
    text: `🛠️ Building *${member.name}*'s slide…`,
  });
}
