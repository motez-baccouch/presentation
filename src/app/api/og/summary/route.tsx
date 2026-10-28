import { ImageResponse } from "next/og";
import { getPresentation } from "@/lib/db";
import {
  collectUpdates,
  groupByPerson,
  naiveCategorize,
} from "@/lib/summary-core";
import { getMember, shortName } from "@/lib/team";
import { formatToday } from "@/lib/date";
import { SummaryStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS: { status: SummaryStatus; color: string; ink: string }[] = [
  { status: "In Progress", color: "#fbbf09", ink: "#1c1407" },
  { status: "In Review", color: "#f79009", ink: "#ffffff" },
  { status: "Released", color: "#f4691e", ink: "#ffffff" },
];

const WIDTH = 1200;
const MIN_HEIGHT = 630;
// room taken by everything except the column bodies (padding, title, headers)
const CHROME_H = 300;
const LABEL_CHARS_PER_LINE = 30;
const LABEL_LINE_H = 16 * 1.2;

function base(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

/** Estimated height of one person block (name + their labels). */
function blockHeight(labels: string[]): number {
  const labelsH = labels.reduce(
    (h, l) =>
      h + Math.max(1, Math.ceil(l.length / LABEL_CHARS_PER_LINE)) * LABEL_LINE_H + 5,
    0,
  );
  return Math.max(34, 18 + labelsH);
}

export async function GET(req: Request) {
  const origin = base(req);
  const deck = await getPresentation();
  // Mirror the deck's actual SUMMARY slide (AI-categorised or hand-tuned).
  // Fall back to the heuristic for decks whose summary predates this field.
  const summarySlide = deck.slides.find((s) => s.type === "SUMMARY");
  const items =
    summarySlide?.document.summary?.length
      ? summarySlide.document.summary
      : naiveCategorize(collectUpdates(deck.slides));

  const columns = COLUMNS.map((col) => ({
    ...col,
    total: items.filter((i) => i.status === col.status).length,
    blocks: groupByPerson(items, col.status),
  }));
  // every item is shown — the image grows taller instead of truncating
  const tallest = Math.max(
    0,
    ...columns.map((col) =>
      col.blocks.reduce((h, b) => h + blockHeight(b.labels) + 14, 0),
    ),
  );
  const height = Math.max(MIN_HEIGHT, Math.ceil(CHROME_H + tallest));

  return new ImageResponse(
    (
      <div
        style={{
          width: `${WIDTH}px`,
          height: `${height}px`,
          display: "flex",
          flexDirection: "column",
          padding: "48px",
          background:
            "linear-gradient(135deg, #fff8ea 0%, #fdeccb 55%, #fbe0c0 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "26px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: "19px",
                fontWeight: 700,
                letterSpacing: "3px",
                color: "#f4691e",
              }}
            >
              {formatToday().toUpperCase()}
            </div>
            <div style={{ fontSize: "52px", fontWeight: 800, color: "#1c1407" }}>
              This Week at Sigma
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${origin}/brand/logo.svg`}
            width={176}
            height={81}
            alt="Sigma Lending"
            style={{ marginTop: "6px" }}
          />
        </div>

        {/* columns */}
        <div style={{ display: "flex", flex: 1, gap: "22px" }}>
          {columns.map((col) => (
            <div
              key={col.status}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                backgroundColor: "#ffffff",
                borderRadius: "20px",
                border: "1px solid #eadfca",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  padding: "13px 18px",
                  backgroundColor: col.color,
                  color: col.ink,
                  fontSize: "21px",
                  fontWeight: 700,
                }}
              >
                {col.status} · {col.total}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "15px",
                  gap: "14px",
                }}
              >
                {!col.blocks.length && (
                  <div
                    style={{
                      display: "flex",
                      fontSize: "15px",
                      fontStyle: "italic",
                      color: "#a08a5e",
                    }}
                  >
                    Nothing here this week
                  </div>
                )}
                {col.blocks.map((block) => {
                  const m = getMember(block.personKey);
                  return (
                    <div
                      key={block.personKey}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "11px",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${origin}${m?.avatar ?? "/avatars/team.png"}`}
                        width={34}
                        height={34}
                        alt=""
                        style={{
                          borderRadius: "9999px",
                          objectFit: "cover",
                          border: `2px solid ${col.color}`,
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          flex: 1,
                          gap: "5px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            fontSize: "12px",
                            fontWeight: 700,
                            letterSpacing: "1.5px",
                            color: "#a08a5e",
                          }}
                        >
                          {(m ? shortName(m) : block.personKey).toUpperCase()}
                        </div>
                        {block.labels.map((label, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "7px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                width: "6px",
                                height: "6px",
                                marginTop: "7px",
                                borderRadius: "3px",
                                backgroundColor: col.color,
                              }}
                            />
                            <div
                              style={{
                                display: "flex",
                                flex: 1,
                                fontSize: "16px",
                                color: "#1c1407",
                                lineHeight: 1.2,
                              }}
                            >
                              {label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: WIDTH, height },
  );
}
