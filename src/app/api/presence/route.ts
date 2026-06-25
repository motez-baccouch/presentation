import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ACTIVE_MS = 20_000; // considered "editing now" within 20s
const STALE_MS = 120_000; // prune rows older than 2 min

// Heartbeat + read in one call. Returns everyone currently active (the client
// filters itself out). No-ops gracefully when there's no database configured.
export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ active: [] });

  const { id, name, slideId } = await req.json().catch(() => ({}));
  if (!id || !name) {
    return NextResponse.json({ error: "id and name required" }, { status: 400 });
  }

  const now = new Date();
  await prisma.presence.upsert({
    where: { id: String(id) },
    create: { id: String(id), name: String(name).slice(0, 40), slideId: slideId ?? null },
    update: { name: String(name).slice(0, 40), slideId: slideId ?? null, updatedAt: now },
  });

  // occasional cleanup
  await prisma.presence
    .deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - STALE_MS) } } })
    .catch(() => {});

  const active = await prisma.presence.findMany({
    where: { updatedAt: { gte: new Date(Date.now() - ACTIVE_MS) } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    active: active.map((p) => ({ id: p.id, name: p.name, slideId: p.slideId })),
  });
}
