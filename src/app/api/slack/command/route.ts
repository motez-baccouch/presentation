import { NextResponse, after } from "next/server";
import crypto from "crypto";
import { findMember, TEAM } from "@/lib/team";
import { formatUpdate } from "@/lib/groq";
import { buildPersonSlides, buildSummarySlide } from "@/lib/templates";
import { upsertPersonSlides, upsertSummarySlide } from "@/lib/db";
import { generateSummary, summaryToText } from "@/lib/summary";
import { formatToday } from "@/lib/date";

const SUMMARY_WORDS = ["summary", "recap", "board", "overview"];

export const runtime = "nodejs";

function verifySlack(raw: string, ts: string | null, sig: string | null): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  // If no secret configured (early local testing) skip verification.
  if (!secret) return true;
  if (!ts || !sig) return false;
  // reject requests older than 5 minutes (replay protection)
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

function appUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function respond(
  responseUrl: string,
  text: string,
  inChannel = false,
) {
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
  const base = appUrl(req);

  const names = TEAM.map((m) => m.key).join(", ");

  if (!text) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: `Usage:\n• \`/presentation <name> <what you worked on>\` — update a slide\n• \`/presentation summary\` — post this week's team recap\nNames: ${names}`,
    });
  }

  // First token is the person; the rest is their free-text update.
  const firstSpace = text.indexOf(" ");
  const nameToken = firstSpace === -1 ? text : text.slice(0, firstSpace);
  const body = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();

  // `/presentation summary` → regenerate the AI status board and post the recap.
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
      text: `I don't recognise "*${nameToken}*". Try one of: ${names}\nFormat: \`/presentation <name> <what you worked on>\``,
    });
  }

  if (!body) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: `Add what *${member.name}* worked on, e.g. \`/presentation ${member.key} finished the open banking PR, fixed the plaid bug\``,
    });
  }

  // Acknowledge immediately, then do the AI + DB work in the background and
  // post the result (with edit link) to Slack's response_url.
  if (responseUrl) {
    after(async () => {
      try {
        const formatted = await formatUpdate(member.name, body);
        const documents = buildPersonSlides(member, {
          role: formatted.role ?? member.role,
          eyebrow: formatted.eyebrow ?? undefined,
          bullets: formatted.bullets,
        });
        await upsertPersonSlides(member.key, documents);
        const link = `${base}/edit?slide=${member.key}`;
        const bulletList = formatted.bullets
          .map((b) => `  • ${b}`)
          .join("\n");
        await respond(
          responseUrl,
          `✅ Updated *${member.name}*'s slide:\n${bulletList}\n\n✏️ Tweak it here: ${link}\n▶️ Present: ${base}/present`,
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
