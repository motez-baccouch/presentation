import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await verifySessionToken(token);
  const { pathname } = req.nextUrl;

  // Gate the editor UI: redirect to login.
  if (pathname.startsWith("/edit") && !authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Gate write/AI/upload APIs (reads stay public).
  const isProtectedApi =
    pathname.startsWith("/api/slides") ||
    pathname.startsWith("/api/person") ||
    pathname.startsWith("/api/upload") ||
    pathname.startsWith("/api/summary") ||
    pathname.startsWith("/api/presence") ||
    pathname.startsWith("/api/slack/post-summary") ||
    pathname.startsWith("/api/ai");
  if (isProtectedApi && req.method !== "GET" && !authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/edit",
    "/edit/:path*",
    "/api/slides",
    "/api/slides/:path*",
    "/api/person/:path*",
    "/api/upload",
    "/api/summary/:path*",
    "/api/presence",
    "/api/slack/post-summary",
    "/api/ai/:path*",
  ],
};
