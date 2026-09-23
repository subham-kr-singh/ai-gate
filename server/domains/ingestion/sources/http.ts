/**
 * Polite HTTP client for source adapters (architecture §101 Resource
 * Discovery, §54 Stage 1).
 *
 * Three rules, enforced in one place so no adapter can forget them:
 *
 *  1. **robots.txt is checked before the first request** to a host, and a
 *     disallowed path throws rather than being silently skipped. A source that
 *     forbids us must fail loudly at the top of a run, not half-way through.
 *  2. **Requests are throttled** per host, so a 60-chapter crawl is spread out
 *     instead of arriving as a burst.
 *  3. **A descriptive User-Agent** identifies the crawler, so the operator of
 *     the source can contact us or block us deliberately.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export const USER_AGENT =
  "GateAI-Ingest/1.0 (+https://github.com/subham-kr-singh/ai-gate; question ingestion)";

const CACHE_DIR = path.join(process.cwd(), ".cache", "ingest");

interface RobotsRules {
  /** Path prefixes this agent may not fetch. */
  disallow: string[];
  /** Path prefixes explicitly allowed, which win over a broad disallow. */
  allow: string[];
  crawlDelayMs: number | null;
}

const robotsCache = new Map<string, RobotsRules>();
const lastRequestAt = new Map<string, number>();

/** Parses the subset of robots.txt that matters: the groups whose User-agent
 * matches ours (`*` or a prefix match on our token), plus crawl-delay. */
export function parseRobots(txt: string, agentToken: string): RobotsRules {
  const lines = txt.split(/\r?\n/);
  const groups: { agents: string[]; rules: RobotsRules }[] = [];
  let current: { agents: string[]; rules: RobotsRules } | null = null;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawKey = "", ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      // A new User-agent line after rules starts a new group.
      if (current && current.rules.disallow.length + current.rules.allow.length > 0) {
        current = null;
      }
      if (!current) {
        current = { agents: [], rules: { disallow: [], allow: [], crawlDelayMs: null } };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && key === "disallow") {
      if (value) current.rules.disallow.push(value);
    } else if (current && key === "allow") {
      if (value) current.rules.allow.push(value);
    } else if (current && key === "crawl-delay") {
      const seconds = Number(value);
      if (!Number.isNaN(seconds)) current.rules.crawlDelayMs = seconds * 1000;
    }
  }

  const token = agentToken.toLowerCase();
  // Most specific matching group wins: an exact agent name beats `*`.
  const exact = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const wildcard = groups.filter((g) => g.agents.includes("*"));
  const chosen = exact.length > 0 ? exact : wildcard;

  return {
    disallow: chosen.flatMap((g) => g.rules.disallow),
    allow: chosen.flatMap((g) => g.rules.allow),
    crawlDelayMs: chosen.find((g) => g.rules.crawlDelayMs !== null)?.rules.crawlDelayMs ?? null,
  };
}

/** Longest-match wins, per the robots.txt convention. */
export function isAllowed(rules: RobotsRules, pathname: string): boolean {
  const longest = (list: string[]): number =>
    list.reduce((best, p) => (pathname.startsWith(p) ? Math.max(best, p.length) : best), -1);
  const deny = longest(rules.disallow);
  const allow = longest(rules.allow);
  if (deny < 0) return true;
  return allow >= deny;
}

async function loadRobots(origin: string): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  let txt = "";
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    txt = res.ok ? await res.text() : "";
  } catch {
    // An unreachable robots.txt is treated as "no rules", matching how the
    // spec is commonly implemented.
    txt = "";
  }
  const rules = parseRobots(txt, USER_AGENT);
  robotsCache.set(origin, rules);
  return rules;
}

/** Throttles to at least `throttleMs` between requests to the same host, and
 * honours a stricter crawl-delay from robots.txt when one is declared. */
async function throttle(origin: string, throttleMs: number, rules: RobotsRules): Promise<void> {
  const wait = Math.max(throttleMs, rules.crawlDelayMs ?? 0);
  const last = lastRequestAt.get(origin) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < wait) await new Promise((r) => setTimeout(r, wait - elapsed));
  lastRequestAt.set(origin, Date.now());
}

export interface FetchTextOptions {
  throttleMs?: number;
  /** Skip the on-disk cache. */
  force?: boolean;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
}

function cachePath(url: string): string {
  const h = createHash("sha256").update(url).digest("hex").slice(0, 24);
  return path.join(CACHE_DIR, `${h}.txt`);
}

/**
 * Fetches a URL as text, honouring robots.txt, throttling, and an on-disk
 * cache.
 *
 * The cache is what makes a re-run cheap and a review reproducible: a
 * reviewer can re-derive any draft's fields without re-fetching the source,
 * which also keeps the load we put on the source proportional to the number
 * of *new* pages rather than the number of runs.
 */
export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<string> {
  const cache = cachePath(url);
  if (!opts.force && existsSync(cache)) return readFileSync(cache, "utf-8");

  const parsed = new URL(url);
  const rules = await loadRobots(parsed.origin);
  if (!isAllowed(rules, parsed.pathname)) {
    throw new Error(
      `robots.txt disallows ${parsed.pathname} on ${parsed.origin}. ` +
        `Refusing to fetch. Remove this source or narrow the unit selection.`
    );
  }

  await throttle(parsed.origin, opts.throttleMs ?? 1500, rules);

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "User-Agent": USER_AGENT,
      ...(opts.method === "POST" ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
    body: opts.body,
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cache, text);
  return text;
}

/** Fetches JSON (used for answer-key endpoints). Never cached: an answer key
 * is the one thing worth re-checking on a re-run. */
export async function fetchJson<T>(url: string, body: unknown, throttleMs = 1500): Promise<T> {
  const parsed = new URL(url);
  const rules = await loadRobots(parsed.origin);
  if (!isAllowed(rules, parsed.pathname)) {
    throw new Error(`robots.txt disallows ${parsed.pathname} on ${parsed.origin}.`);
  }
  await throttle(parsed.origin, throttleMs, rules);

  const res = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}


/** Where downloaded PDFs live, keyed by a hash of their URL. */
const PDF_CACHE_DIR = path.join(process.cwd(), ".cache", "ingest-pdfs");

export interface DownloadedPdf {
  filePath: string;
  /** sha256 of the bytes, recorded as provenance. */
  artifactHash: string;
  /** Read from disk rather than the network. */
  fromCache: boolean;
}

/**
 * Downloads a PDF for ingestion, under the same robots.txt and throttling
 * rules as `fetchText`.
 *
 * This exists rather than reusing `fetcher.ts` (which serves the GO GitHub
 * releases) because PDFs are the one artifact whose provenance must be exact:
 * the archive here is a government exam site, and we would rather hit it once
 * and keep a hash than re-download on every run. A cached file is returned
 * untouched, so a re-run adds no load to the source.
 */
export async function downloadPdf(
  url: string,
  opts: { throttleMs?: number; force?: boolean } = {}
): Promise<DownloadedPdf> {
  const h = createHash("sha256").update(url).digest("hex").slice(0, 24);
  const filePath = path.join(PDF_CACHE_DIR, `${h}.pdf`);
  const hashPath = `${filePath}.sha256`;

  if (!opts.force && existsSync(filePath) && existsSync(hashPath)) {
    const artifactHash = readFileSync(hashPath, "utf-8").trim();
    const size = readFileSync(filePath).byteLength;
    // A zero-byte cache file means a previous run wrote before a failure;
    // re-fetch rather than feed an empty buffer to the PDF parser.
    if (size > 0 && artifactHash) return { filePath, artifactHash, fromCache: true };
  }

  const parsed = new URL(url);
  const rules = await loadRobots(parsed.origin);
  if (!isAllowed(rules, parsed.pathname)) {
    throw new Error(
      `robots.txt disallows ${parsed.pathname} on ${parsed.origin}. Refusing to fetch.`
    );
  }
  await throttle(parsed.origin, opts.throttleMs ?? 1500, rules);

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/pdf,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0) throw new Error(`Empty response body for ${url}`);
  const artifactHash = createHash("sha256").update(buf).digest("hex");

  mkdirSync(PDF_CACHE_DIR, { recursive: true });
  writeFileSync(filePath, buf);
  writeFileSync(hashPath, artifactHash);
  return { filePath, artifactHash, fromCache: false };
}
