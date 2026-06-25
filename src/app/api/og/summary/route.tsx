import { ImageResponse } from "next/og";
import { getPresentation } from "@/lib/db";
import { collectUpdates, naiveCategorize } from "@/lib/summary-core";
import { getMember } from "@/lib/team";
import { formatToday } from "@/lib/date";
import { SummaryStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS: { status: SummaryStatus; color: string; ink: string }[] = [
  { status: "In Progress", color: "#fbbf09", ink: "#1c1407" },
  { status: "In Review", color: "#f79009", ink: "#ffffff" },
  { status: "Released", color: "#f4691e", ink: "#ffffff" },
];

function base(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(req: Request) {
  const origin = base(req);
  const deck = await getPresentation();
  const items = naiveCategorize(collectUpdates(deck.slides));

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
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
          {COLUMNS.map((col) => {
            const list = items.filter((i) => i.status === col.status);
            const shown = list.slice(0, 6);
            return (
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
                  {col.status} · {list.length}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "15px",
                    gap: "12px",
                  }}
                >
                  {shown.map((it, i) => {
                    const m = getMember(it.personKey);
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
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
                            fontSize: "16px",
                            color: "#1c1407",
                            lineHeight: 1.15,
                          }}
                        >
                          {it.label}
                        </div>
                      </div>
                    );
                  })}
                  {list.length > shown.length && (
                    <div style={{ display: "flex", fontSize: "14px", color: "#a08a5e" }}>
                      +{list.length - shown.length} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
