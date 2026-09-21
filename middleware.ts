import { NextResponse, type NextRequest } from "next/server";

/**
 * The only thing that must happen before any HTML is sent: choosing the landing
 * page for "/". A redirect from inside app/page.tsx streams after the shell has
 * been flushed (root loading.tsx opens a Suspense boundary), so the browser
 * received a 200 plus a meta-refresh and visibly flashed a blank page before
 * moving. Middleware answers with a real 307 instead.
 *
 * Cookie presence only — signature and allowlist are verified by the page.
 */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("gate_ai_session");
  const url = req.nextUrl.clone();
  url.pathname = hasSession ? "/dashboard" : "/login";
  return NextResponse.redirect(url);
}

export const config = { matcher: "/" };
