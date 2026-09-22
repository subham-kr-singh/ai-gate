/**
 * server/domains/resources/resource.config.ts
 *
 * Where the ingestion job is allowed to read from. Reliability follows
 * architecture §48 (OFFICIAL > VERIFIED > CURATED > COMMUNITY > AI_GENERATED);
 * the tutor cites chunks and prefers the higher classes when two sources
 * disagree.
 *
 * Sources are seeded wikis/notes chosen for stable markup and permissive
 * licensing rather than scraped exam portals, which both rate-limit and
 * forbid redistribution. Add a source here, not in the fetch code.
 */

export type Reliability = "OFFICIAL" | "VERIFIED" | "CURATED" | "COMMUNITY" | "AI_GENERATED";

export const RELIABILITY_RANK: Record<Reliability, number> = {
  OFFICIAL: 5,
  VERIFIED: 4,
  CURATED: 3,
  COMMUNITY: 2,
  AI_GENERATED: 1,
};

export interface ResourceSource {
  url: string;
  /** Canonical subject name used to link the fetched page back to the syllabus. */
  subject: string;
  reliability: Reliability;
  license: string | null;
}

export const RESOURCE_SOURCES: ResourceSource[] = [
  {
    url: "https://en.wikipedia.org/wiki/Operating_system",
    subject: "Operating Systems",
    reliability: "CURATED",
    license: "CC BY-SA 4.0",
  },
  {
    url: "https://en.wikipedia.org/wiki/Process_(computing)",
    subject: "Operating Systems",
    reliability: "CURATED",
    license: "CC BY-SA 4.0",
  },
  {
    url: "https://en.wikipedia.org/wiki/Page_replacement_algorithm",
    subject: "Operating Systems",
    reliability: "CURATED",
    license: "CC BY-SA 4.0",
  },
  {
    url: "https://en.wikipedia.org/wiki/Database_normalization",
    subject: "Database Management Systems",
    reliability: "CURATED",
    license: "CC BY-SA 4.0",
  },
  {
    url: "https://en.wikipedia.org/wiki/Internet_protocol_suite",
    subject: "Computer Networks",
    reliability: "CURATED",
    license: "CC BY-SA 4.0",
  },
  {
    url: "https://en.wikipedia.org/wiki/Subnetwork",
    subject: "Computer Networks",
    reliability: "CURATED",
    license: "CC BY-SA 4.0",
  },
  {
    url: "https://en.wikipedia.org/wiki/Algorithm",
    subject: "Algorithms",
    reliability: "CURATED",
    license: "CC BY-SA 4.0",
  },
  {
    url: "https://en.wikipedia.org/wiki/Theory_of_computation",
    subject: "Theory of Computation",
    reliability: "CURATED",
    license: "CC BY-SA 4.0",
  },
  {
    url: "https://en.wikipedia.org/wiki/Compiler",
    subject: "Compiler Design",
    reliability: "CURATED",
    license: "CC BY-SA 4.0",
  },
  {
    url: "https://en.wikipedia.org/wiki/Computer_architecture",
    subject: "Computer Organization and Architecture",
    reliability: "CURATED",
    license: "CC BY-SA 4.0",
  },
];

/** Characters of a page that are kept as one chunk. Small enough to cite a
 * section, large enough to stand alone without the rest of the page. */
export const CHUNK_TARGET_CHARS = 1200;

/** Pages shorter than this are nav stubs or disambiguation and are skipped. */
export const MIN_PAGE_CHARS = 400;

/** Per-run ceiling so a slow or hostile host cannot stall the cron sweep. */
export const FETCH_TIMEOUT_MS = 20_000;
export const MAX_CHUNKS_PER_PAGE = 40;
