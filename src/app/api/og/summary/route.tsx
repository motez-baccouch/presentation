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

export async function GET() {
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
          padding: "52px",
          backgroundColor: "#fff8ea",
          fontFamily: "sans-serif",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "28px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: "20px",
                fontWeight: 700,
                letterSpacing: "3px",
                color: "#f4691e",
              }}
            >
              {formatToday().toUpperCase()}
            </div>
            <div style={{ fontSize: "54px", fontWeight: 800, color: "#1c1407" }}>
              This Week at Sigma
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: "26px",
              fontWeight: 800,
              color: "#f4691e",
            }}
          >
            Σ Sigma Lending
          </div>
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
                    padding: "14px 18px",
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
                    padding: "16px",
                    gap: "12px",
                  }}
                >
                  {shown.map((it, i) => {
                    const m = getMember(it.personKey);
                    return (
                      <div
                        key={i}
                        style={{ display: "flex", alignItems: "center", gap: "10px" }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "26px",
                            height: "26px",
                            borderRadius: "999px",
                            backgroundColor: col.color,
                            color: "#ffffff",
                            fontSize: "13px",
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {(m?.name ?? "?").charAt(0)}
                        </div>
                        <div style={{ display: "flex", fontSize: "16px", color: "#1c1407" }}>
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
