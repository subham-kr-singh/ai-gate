import { NextResponse, type NextRequest } from "next/server";

/**
 * The only things that must happen before any HTML is sent.
 *
 * 1. Landing page for "/". A redirect from inside app/page.tsx streams after
 *    the shell has been flushed (root loading.tsx opens a Suspense boundary),
 *    so the browser received a 200 plus a meta-refresh and visibly flashed a
 *    blank page before moving. Middleware answers with a real 307 instead.
 *    Cookie presence only — signature and allowlist are verified by the page.
 *
 * 2. Malformed record ids on dynamic pages. Every id in this app is a cuid, so
 *    anything else (a truncated paste, a hand-typed slug, a scanner probe) can
 *    never resolve. Catching it here returns a real 404 instead of letting the
 *    page stream a 200 and only *then* discover the record is missing.
 *
 *    A well-formed-but-unknown id still renders the not-found UI with a 200:
 *    once `loading.tsx` opens a Suspense boundary the response head is already
 *    committed, and no `notFound()` downstream can change it. Trade-off taken
 *    deliberately — the skeleton is worth more than the status code on an
 *    auth-gated app that search engines cannot index.
 */
const CUID = /^[a-z0-9]{20,}$/;

// Static segment that sits where a cuid would and must not be validated as an
// id (`/practice/dpp` is the practice-set index, not a unit id).
const RESERVED = new Set(["dpp"]);

/**
 * True when a dynamic page path carries a value that can never be a record id.
 * Works on split segments rather than matcher-captured params: Next.js
 * compiles matcher `:id` into a regexp that does not reliably capture a single
 * dynamic segment, so the segments are the stable input here.
 */
function hasMalformedId(pathname: string): boolean {
  const s = pathname.split("/").filter(Boolean);
  const bad = (v: string | undefined) => v !== undefined && !RESERVED.has(v) && !CUID.test(v);

  switch (s[0]) {
    case "syllabus":
      return s.length === 2 && bad(s[1]);
    case "practice":
      if (s.length === 2) return s[1] === "dpp" ? false : bad(s[1]);
      if (s.length === 5 && s[1] === "dpp" && s[3] === "question") return bad(s[2]) || bad(s[4]);
      return false;
    case "tests":
    case "mocks":
      if (s.length === 2) return bad(s[1]);
      if (s.length === 3 && s[2] === "result") return bad(s[1]);
      return false;
    default:
      return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = req.cookies.has("gate_ai_session") ? "/dashboard" : "/login";
    return NextResponse.redirect(url);
  }

  if (hasMalformedId(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/not-found";
    return NextResponse.rewrite(url, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/syllabus/:path*", "/practice/:path*", "/tests/:path*", "/mocks/:path*"],
};
