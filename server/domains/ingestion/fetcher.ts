import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const GO_PDFS_REPO = "GATEOverflow/GO-PDFs";
const DOWNLOAD_DIR = path.resolve(process.cwd(), ".cache/gopdfs");

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  /** GitHub's `id` field, stable across re-uploads of the same tag. */
  id: number;
}

export interface Release {
  tag: string;
  publishedAt: string | null;
  assets: ReleaseAsset[];
}

export interface DownloadedAsset {
  tag: string;
  name: string;
  /** Path on local disk. */
  filePath: string;
  url: string;
  contentHash: string;
  /** True when the file was already present with a matching hash. */
  cached: boolean;
  size: number;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // Unauthenticated requests work but are rate-limited to 60/hr; the token
  // raises that to 5000/hr, which matters when walking many release years.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function ghJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** Lists releases, newest first. `tag` filters to exactly one release. */
export async function listReleases(tag?: string): Promise<Release[]> {
  const raw = await ghJson<
    { tag_name: string; published_at: string | null; assets: { id: number; name: string; browser_download_url: string; size: number }[] }[]
  >(`https://api.github.com/repos/${GO_PDFS_REPO}/releases?per_page=100`);

  const mapped = raw.map((r) => ({
    tag: r.tag_name,
    publishedAt: r.published_at,
    assets: r.assets.map((a) => ({ id: a.id, name: a.name, url: a.browser_download_url, size: a.size })),
  }));

  if (!tag) return mapped;
  const match = mapped.filter((r) => r.tag === tag);
  if (match.length === 0) {
    throw new Error(
      `Release tag "${tag}" not found. Available: ${mapped.map((r) => r.tag).join(", ")}`
    );
  }
  return match;
}

function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Downloads one asset, returning the existing file when its hash already
 * matches what is on disk. The stored `.sha256` sidecar is what makes a
 * re-run a no-op without re-downloading the (tens of MB) PDF.
 */
export async function downloadAsset(
  tag: string,
  asset: ReleaseAsset,
  opts: { force?: boolean } = {}
): Promise<DownloadedAsset> {
  const dir = path.join(DOWNLOAD_DIR, tag);
  const filePath = path.join(dir, asset.name);
  const hashPath = `${filePath}.sha256`;
  const url = asset.url;

  if (!opts.force && existsSync(filePath) && existsSync(hashPath)) {
    const stored = (await readFile(hashPath, "utf-8")).trim();
    const actual = hashBuffer(await readFile(filePath));
    if (stored === actual) {
      return { tag, name: asset.name, filePath, url, contentHash: actual, cached: true, size: asset.size };
    }
  }

  await mkdir(dir, { recursive: true });
  const res = await fetch(url, {
    headers: { ...githubHeaders(), Accept: "application/octet-stream" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${url}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const contentHash = hashBuffer(buf);
  await writeFile(filePath, buf);
  await writeFile(hashPath, contentHash);

  return { tag, name: asset.name, filePath, url, contentHash, cached: false, size: buf.length };
}

/** Lists and downloads every PDF asset of a release. */
export async function fetchReleaseAssets(
  tag: string,
  opts: { force?: boolean } = {}
): Promise<DownloadedAsset[]> {
  const [release] = await listReleases(tag);
  if (!release) throw new Error(`No release found for tag "${tag}"`);
  const pdfs = release.assets.filter((a) => a.name.toLowerCase().endsWith(".pdf"));
  if (pdfs.length === 0) {
    throw new Error(`Release "${tag}" has no PDF assets (found: ${release.assets.map((a) => a.name).join(", ") || "none"})`);
  }
  const out: DownloadedAsset[] = [];
  for (const asset of pdfs) out.push(await downloadAsset(tag, asset, opts));
  return out;
}
