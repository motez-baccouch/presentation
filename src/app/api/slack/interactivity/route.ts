import { NextResponse, after } from "next/server";
import { verifySlack, slackApi, appUrl } from "@/lib/slack";
import { getMember } from "@/lib/team";
import { formatCategorized } from "@/lib/groq";
import { buildPersonSlides } from "@/lib/templates";
import { upsertPersonSlides } from "@/lib/db";

export const runtime = "nodejs";

interface ViewValue {
  value?: string;
  selected_option?: { value?: string };
}

export async function POST(req: Request) {
  const raw = await req.text();
  const ts = req.headers.get("x-slack-request-timestamp");
  const sig = req.headers.get("x-slack-signature");
  if (!verifySlack(raw, ts, sig)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const params = new URLSearchParams(raw);
  const payload = JSON.parse(params.get("payload") || "{}");

  if (
    payload.type === "view_submission" &&
    payload.view?.callback_id === "presentation_submit"
  ) {
    const v = payload.view.state.values as Record<
      string,
      Record<string, ViewValue>
    >;
    const personKey = v?.person?.person?.selected_option?.value;
    const delivered = v?.delivered?.v?.value ?? "";
    const inReview = v?.in_review?.v?.value ?? "";
    const inProgress = v?.in_progress?.v?.value ?? "";
    const userId = payload.user?.id;
    const member = personKey ? getMember(personKey) : undefined;

    if (!member) {
      return NextResponse.json({
        response_action: "errors",
        errors: { person: "Please pick a teammate." },
      });
    }
    if (!delivered.trim() && !inReview.trim() && !inProgress.trim()) {
      return NextResponse.json({
        response_action: "errors",
        errors: { delivered: "Add at least one update in any box." },
      });
    }

    const base = appUrl(req);
    after(async () => {
      try {
        const bullets = await formatCategorized(member.name, {
          delivered,
          inReview,
          inProgress,
        });
        const documents = buildPersonSlides(member, { bullets });
        await upsertPersonSlides(member.key, documents);
        if (userId) {
          await slackApi("chat.postMessage", {
            channel: userId,
            text: `✅ Your slide is updated, *${member.name}*.\n✏️ Tweak it: ${base}/edit?slide=${member.key}\n▶️ Present: ${base}/present`,
          });
        }
      } catch (err) {
        console.error("interactivity error", err);
      }
    });

    // Close the modal immediately; work happens in the background.
    return NextResponse.json({ response_action: "clear" });
  }

  return new NextResponse(null, { status: 200 });
}
