/**
 * server/domains/gateoverflow/gateoverflow.config.ts
 *
 * Where GATE Overflow questions are read from, and how their chapter names
 * map onto this app's canonical syllabus.
 *
 * ## Which repository is the right source?
 *
 * The user-facing site is gateoverflow.in (a Question2Answer install); the
 * GitHub organisation is GATEOverflow. There is no repo that dumps the site
 * as one clean, answered, machine-readable question file, so the choice is
 * between three real options:
 *
 * 1. `GATEOverflow/GO-PDFs` — the official, actively maintained corpus
 *    (1.3k stars). It ships generated PDFs on Releases, plus the raw
 *    `book_filter6.html` the PDFs are rendered from. The HTML is the best
 *    *official* machine-readable artefact: ~3,200 questions with statement,
 *    A–D options, chapter heading and an answer-key table, all in one file.
 *    Its limits: only a subset of questions have a key in the table (the
 *    rest are rendered as "Q-Q"), the HTML is UGC-NET CSE rather than GATE
 *    CSE, and topic granularity is chapter-level.
 *
 * 2. `Mr-Nobody003/GATE` — a community mirror that ran the GO PDFs through
 *    an OCR/layout pipeline and published `data/formatted_all.json`. It is
 *    the cleanest *structured* form of the same content (3,809 questions
 *    with qtype, LaTeX intact, NAT ranges as `{low, high}`, MSQ answers as
 *    option lists, and topic slugs), and it covers the GATE CSE volumes.
 *    Its limits: one maintainer, no licence file, and its answers are the
 *    page's answer letters rather than independently verified keys.
 *
 * 3. `Arka-h/GATE-CS-quiz-generator` — the GO volumes split into per-section
 *    CSVs. Useful for topic-level splits, but a lossy re-derivation of the
 *    same PDFs.
 *
 * The official repo wins on provenance and licence clarity; the mirror wins
 * on structure. Both are therefore configured here, the official HTML as the
 * default. `gateoverflow.source.test.ts` documents the comparison so the
 * decision is not lost.
 *
 * ## Licensing
 *
 * GATE Overflow content is community-contributed and the repos carry no
 * licence file. This app is a single-user personal study tool, so the import
 * is treated as personal-use ingestion of publicly published material, and
 * every imported question carries `source`, `sourceUrl` and `license` for
 * attribution. If this ever becomes a public product, get permission from
 * GATE Overflow first (admin@gateoverflow.com) — do not redistribute.
 */

export type GateOverflowSourceKind = "html" | "json";

export interface GateOverflowSource {
  /** Stable id, used as `SourceIngestion.sourceId` and in the CLI/API. */
  id: string;
  label: string;
  kind: GateOverflowSourceKind;
  url: string;
  /** Value written to `Question.license`. */
  license: string | null;
  /** Human-readable note on why this source is (or is not) the default. */
  note: string;
  /** Whether the scheduled import pulls this source. See AUTO_SOURCE_IDS. */
  auto?: boolean;
}

export const GATEOVERFLOW_SOURCES: Record<string, GateOverflowSource> = {
  "go-pdfs-json": {
    id: "go-pdfs-json",
    label: "structured JSON mirror (Mr-Nobody003/GATE)",
    kind: "json",
    url: "https://raw.githubusercontent.com/Mr-Nobody003/GATE/main/data/formatted_all.json",
    license: "GATE Overflow community content (mirrored) — personal use, attribute gateoverflow.in",
    note: "GATE CSE corpus, best structure (qtype, LaTeX, NAT ranges) and subtopic labels. Community-maintained, no licence file.",
    auto: true,
  },
  "go-pdfs-html": {
    id: "go-pdfs-html",
    label: "official book HTML (GATEOverflow/GO-PDFs)",
    kind: "html",
    url: "https://github.com/GATEOverflow/GO-PDFs/releases/download/ugcnet/book_filter6.html",
    license: "GATE Overflow community content — personal use, attribute gateoverflow.in",
    note: "Official repo with published answer keys. Despite the filename this is the UGC-NET CS book, not the GATE CSE one, so it carries no GO ids in common with the JSON mirror — the two are complementary, not duplicates. Chapter-level topics only.",
    auto: true,
  },
};

/**
 * The source used when a caller names none. This is the GATE CSE corpus,
 * because that is the exam the app prepares for: the official book HTML is
 * UGC-NET CS material, so defaulting to it would fill the bank with the wrong
 * paper. Both are imported on a schedule (see AUTO_SOURCE_IDS).
 */
export const DEFAULT_SOURCE_ID = "go-pdfs-json";

/**
 * Sources the scheduled import pulls, in order. They are disjoint corpora —
 * measured at zero shared GO post ids — so importing only one silently
 * halves the bank. Kept as data rather than a hard-coded list in the job so
 * adding a mirror is a config change.
 */
export const AUTO_SOURCE_IDS: string[] = Object.values(GATEOVERFLOW_SOURCES)
  .filter((s) => s.auto)
  .map((s) => s.id);

/** Return a configured source by id, throwing with the known ids when no source matches. */
export function getSource(id: string): GateOverflowSource {
  const source = GATEOVERFLOW_SOURCES[id];
  if (!source) {
    throw new Error(
      `Unknown GATE Overflow source "${id}". Known: ${Object.keys(GATEOVERFLOW_SOURCES).join(", ")}`
    );
  }
  return source;
}

/**
 * How the book's chapter headings line up with the seeded syllabus.
 *
 * The book is coarser than the app: one chapter ("Operating System") covers
 * six seeded units, and the app splits maths into "Discrete & Engineering
 * Mathematics" while the book splits it four ways. The app has no concept of
 * the book's "Non GATE CSE" chapters (Java, Computer Graphics, …), so those
 * are deliberately absent — the import reports them as unmapped instead of
 * filing them under a guessed unit.
 *
 * Keys are the `chapter.name` values exactly as they appear in the source.
 */
export interface ChapterMapping {
  subjectCode: string;
  /** Canonical unit name from prisma/seed/syllabus.data.ts. */
  unitName: string;
}

export const CHAPTER_MAP: Record<string, ChapterMapping> = {
  // --- Discrete & Engineering Mathematics (MATH) ---
  "Discrete Mathematics: Combinatory": { subjectCode: "MATH", unitName: "Combinatorics" },
  "Discrete Mathematics: Graph Theory": { subjectCode: "MATH", unitName: "Graph Theory" },
  "Discrete Mathematics: Mathematical Logic": { subjectCode: "MATH", unitName: "Mathematical Logic" },
  "Discrete Mathematics: Set Theory & Algebra": { subjectCode: "MATH", unitName: "Set Theory & Algebra" },
  "Engineering Mathematics: Linear Algebra": { subjectCode: "MATH", unitName: "Linear Algebra" },
  "Engineering Mathematics: Probability": { subjectCode: "MATH", unitName: "Probability" },
  "Engineering Mathematics: Calculus": { subjectCode: "MATH", unitName: "Calculus" },
  // The book has no combinatorics-for-GA chapter; GA counting lives under
  // Quantitative Aptitude, which maps to the GA subject below.

  // --- General Aptitude (GA) ---
  "General Aptitude: Verbal Aptitude": { subjectCode: "GA", unitName: "Verbal Aptitude" },
  "General Aptitude: Quantitative Aptitude": { subjectCode: "GA", unitName: "Quantitative Aptitude" },
  "General Aptitude: Analytical Aptitude": { subjectCode: "GA", unitName: "Analytical Aptitude" },
  "General Aptitude: Spatial Aptitude": { subjectCode: "GA", unitName: "Spatial Aptitude" },

  // --- Algorithms (ALGO) ---
  Algorithms: { subjectCode: "ALGO", unitName: "Fundamental Algorithmic Topics" },

  // --- Compiler Design (CD) ---
  "Compiler Design": { subjectCode: "CD", unitName: "Lexical Analysis" },

  // --- Programming & Data Structures (PDS) ---
  "Programming and DS: Data Structures": { subjectCode: "PDS", unitName: "Arrays" },
  "Programming and DS: Programming": { subjectCode: "PDS", unitName: "Programming" },
  "Programming: Programming in C": { subjectCode: "PDS", unitName: "Programming" },
  // The HTML book labels the same chapters differently to the JSON mirror.
  "Programming and DS: DS": { subjectCode: "PDS", unitName: "Arrays" },
  "Programming and DS": { subjectCode: "PDS", unitName: "Programming" },

  // --- Theory of Computation (TOC) ---
  "Theory of Computation": { subjectCode: "TOC", unitName: "Finite Automata & Regular Languages" },

  // --- Digital Logic (DL) ---
  "Digital Logic": { subjectCode: "DL", unitName: "Logic Functions & Minimization" },

  // --- Computer Organization & Architecture (COA) ---
  "CO & Architecture": { subjectCode: "COA", unitName: "CPU Architecture & Addressing Modes" },
  "CO and Architecture": { subjectCode: "COA", unitName: "CPU Architecture & Addressing Modes" },

  // --- Operating Systems (OS) ---
  "Operating System": { subjectCode: "OS", unitName: "Process Management I" },

  // --- Databases (DBMS) ---
  Databases: { subjectCode: "DBMS", unitName: "Relational Model" },

  // --- Computer Networks (CN) ---
  "Computer Networks": { subjectCode: "CN", unitName: "TCP, UDP & IP" },

  // Discrete Mathematics appears both as its own chapters and as one
  // "Engineering Mathematics: Discrete Mathematics" bucket in the HTML book.
  "Engineering Mathematics: Discrete Mathematics": {
    subjectCode: "MATH",
    unitName: "Set Theory & Algebra",
  },
};

/**
 * The book also has two catch-all chapters — "Unknown Category" (197 rows) and
 * "Others: Others" (687 rows) — that hold questions whose subject was never
 * classified. Only ~9% of them carry a `qa-tag-link` subject tag, but for
 * those the tag *is* the subject, so it is a trustworthy signal. The rest are
 * left unmapped rather than guessed at.
 */
export const TAG_TO_SUBJECT: Record<string, string> = {
  "computer-networks": "CN",
  "operating-system": "OS",
  databases: "DBMS",
  "theory-of-computation": "TOC",
  "digital-logic": "DL",
  "data-structures": "PDS",
  algorithms: "ALGO",
  "co-and-architecture": "COA",
  "compiler-design": "CD",
  "discrete-mathematics": "MATH",
  "programming-in-c": "PDS",
};

/**
 * Chapters that are real content but outside the GATE CSE syllabus this app
 * teaches (UGC-NET-only and non-CSE subjects). Reported as deliberately
 * skipped, which is different from "we failed to map this".
 */
export const NON_GATE_CHAPTERS: string[] = [
  "Artificial Intelligence",
  "Data Mining and Warehousing",
  "IS&Software Engineering",
  "Non GATE CSE: IS&Software Engineering",
];

/**
 * Chapter → unit is only as precise as the book's own headings, so an
 * imported question is also placed by its subtopic prefix ("Cache Memory",
 * "Subnetting", …): the subtopic is resolved to a seeded Concept, and the
 * concept's own unit/topic/subject decide where the question lands. This
 * gives per-question placement instead of filing every Operating Systems
 * question under one unit.
 *
 * Aliases bridge the book's vocabulary to the syllabus' wording. Targets are
 * concept names exactly as they are seeded in prisma/seed; a subtopic with no
 * alias and no exact concept-name match falls back to the chapter's unit.
 */
export const CONCEPT_ALIASES: Record<string, string> = {
  // Discrete & Engineering Mathematics
  "eigen value": "Eigenvalues",
  eigenvalues: "Eigenvalues",
  eigenvectors: "Eigenvectors",
  matrix: "Matrices",
  determinant: "Determinants",
  "system of equations": "Systems of linear equations",
  "rank of matrix": "Matrices",
  "vector space": "Linear transformations / decomposition",
  subspace: "Linear transformations / decomposition",
  "group theory": "Groups",
  relations: "Relations",
  functions: "Functions",
  "set theory": "Sets",
  "venn diagram": "Sets",
  lattice: "Lattices",
  "partial order": "Partial orders",
  "propositional logic": "Propositional logic",
  "first order logic": "First-order logic",
  "recurrence relation": "Recurrence relations",
  "generating functions": "Generating functions",
  counting: "Counting",
  combinatorics: "Counting",
  "graph coloring": "Coloring",
  "graph connectivity": "Connectivity",
  "graph matching": "Matching",
  "random variable": "Random variables",
  "conditional probability": "Conditional probability",
  "bayes theorem": "Bayes theorem",
  "binomial distribution": "Binomial distribution",
  "poisson distribution": "Poisson distribution",
  "normal distribution": "Normal distribution",
  "exponential distribution": "Exponential distribution",
  "uniform distribution": "Uniform distribution",
  limits: "Limits",
  continuity: "Continuity",
  differentiation: "Differentiability",
  integration: "Integration",
  "definite integral": "Integration",
  "maxima minima": "Maxima and minima",

  // General Aptitude
  percentage: "Percentages",
  "ratio proportion": "Ratio and proportion",
  "profit loss": "Profit and loss",
  "speed time distance": "Time, speed and distance",
  "permutation and combination": "Permutations and combinations",
  "data interpretation": "Data interpretation",
  "tabular data": "Data interpretation",
  "pie chart": "Data interpretation",
  "bar graph": "Data interpretation",
  "line graph": "Data interpretation",
  "numerical computation": "Numerical computation",
  logarithms: "Numerical computation",
  "quadratic equations": "Numerical computation",
  "logical reasoning": "Logic: deduction and induction",
  "seating arrangement": "Logical sequences",
  "round table arrangement": "Logical sequences",
  "family relationship": "Logical sequences",
  "direction sense": "Logical sequences",
  synonyms: "Word groups",
  antonyms: "Word groups",
  "word pairs": "Word groups",
  "word meaning": "Word groups",
  "phrase meaning": "Word groups",
  "most appropriate word": "Sentence completion",
  "sentence ordering": "Sentence completion",
  "incorrect sentence part": "Sentence completion",
  "verbal reasoning": "Verbal analogies",
  "english grammar": "English grammar",
  tenses: "English grammar",
  articles: "English grammar",
  prepositions: "English grammar",
  "grammatical error": "English grammar",
  "paper folding": "Paper folding",
  "mirror image": "Cutting and rotation",
  "image rotation": "Cutting and rotation",
  "patterns in two dimensions": "Transformation of shapes",
  "patterns in three dimensions": "Transformation of shapes",
  "3d structure": "Transformation of shapes",
  assembling: "Assembling and grouping of figures",
  "assembling pieces": "Assembling and grouping of figures",
  "sequence series": "Numerical relations",
  "number series": "Numerical relations",

  // Algorithms
  "time complexity": "Asymptotic notations",
  "asymptotic notations": "Asymptotic notations",
  "space complexity": "Space complexity",
  "minimum spanning tree": "Spanning trees",
  "shortest path": "Shortest paths",
  dijkstras: "Shortest paths",
  "bellman ford": "Shortest paths",
  "dynamic programming": "Dynamic-programming algorithms",
  "greedy algorithms": "Greedy algorithms",
  sorting: "Sorting",
  "quick sort": "Sorting",
  "merge sort": "Sorting",
  "heap sort": "Sorting",
  "bubble sort": "Sorting",
  "insertion sort": "Sorting",
  "selection sort": "Sorting",
  searching: "Searching",
  "binary search": "Searching",
  "graph search": "Graph traversal",
  "depth first search": "Graph traversal",
  "breadth first search": "Graph traversal",
  "topological sort": "Graph traversal",
  "divide and conquer": "Divide-and-conquer algorithms",
  "binary search tree": "Binary search trees",
  "binary tree": "Binary trees",
  "tree traversal": "Tree traversal",
  "linked list": "Linked-list representation",
  stack: "Stacks",
  queue: "Queues",
  "priority queue": "Queues",
  hashing: "Hash tables",
  "double hashing": "Hash tables",
  "linear probing": "Hash tables",
  "uniform hashing": "Hash tables",
  array: "Array representation",

  // Programming & Data Structures
  pointers: "Programming in C",
  "programming in c": "Programming in C",
  recursion: "Recursion",
  "parameter passing": "Parameter passing",
  "variable scope": "Scope",

  // Theory of Computation
  "finite automata": "Finite automata",
  "finite state machines": "Finite automata",
  "regular language": "Regular languages",
  "regular expression": "Regular expressions",
  "regular grammar": "Regular languages",
  "context free language": "Context-free languages",
  "context free grammar": "Context-free grammars",
  "pushdown automata": "Pushdown automata",
  decidability: "Undecidability",
  reduction: "Undecidability",
  "turing machine": "Turing machines",

  // Digital Logic
  "number representation": "Number representation",
  "number system": "Number representation",
  "boolean algebra": "Boolean algebra",
  "k map": "Minimization",
  "min sum of products form": "Minimization",
  "min products of sum form": "Minimization",
  "canonical normal form": "Boolean function representation",
  "functional completeness": "Boolean function representation",
  "logic functions": "Logic functions",

  // Computer Organization & Architecture
  "addressing modes": "Addressing modes",
  "instruction format": "Instruction representation",
  "instruction execution": "Instruction execution",
  "machine instruction": "Instruction representation",
  "cache memory": "Cache and related memory concepts",
  "average memory access time": "Cache and related memory concepts",
  "direct mapping": "Cache and related memory concepts",
  pipelining: "Pipelining",
  speedup: "Pipeline performance",
  "data dependency": "Pipeline hazards",
  "data hazards": "Pipeline hazards",
  hazards: "Pipeline hazards",
  stall: "Pipeline hazards",
  microprogramming: "Control-unit organization",
  "control unit": "Control-unit organization",
  interrupts: "I/O mechanisms",
  dma: "I/O mechanisms",
  "io handling": "I/O organization",

  // Operating Systems
  "process synchronization": "Synchronization",
  semaphore: "Synchronization",
  "inter process communication": "Inter-process communication",
  "process scheduling": "CPU scheduling",
  "round robin scheduling": "CPU scheduling",
  srtf: "CPU scheduling",
  threads: "Threads",
  process: "Processes",
  "context switch": "Processes",
  "virtual memory": "Virtual memory",
  "page replacement": "Virtual memory",
  "demand paging": "Virtual memory",
  "multilevel paging": "Address-space management",
  "translation lookaside buffer": "Address-space management",
  "best fit": "Memory allocation concepts",
  "memory management": "Memory management",
  deadlock: "Deadlock concepts",
  "resource allocation": "Deadlock concepts",
  "bankers algorithm": "Deadlock avoidance and related techniques",
  "file system": "File systems",
  "disk scheduling": "I/O systems",
  disk: "I/O systems",
  "linked allocation": "File management",

  // Databases
  sql: "SQL",
  query: "SQL",
  "database normalization": "Normalization",
  "normal forms": "Normalization",
  decomposition: "Normalization",
  "functional dependency": "Functional dependencies",
  "armstrong axioms": "Functional dependencies",
  "relational algebra": "Relational algebra",
  "relational calculus": "Tuple calculus",
  "tuple relational calculus": "Tuple calculus",
  "database design": "Database design",
  "er diagram": "Entity-relationship model",
  "relational model": "Relational model",
  "database schema": "Relational model",
  "transaction and concurrency": "Concurrency control",
  "conflict serializable": "Concurrency control",
  "timestamp ordering": "Concurrency control",
  "two phase locking protocol": "Concurrency control",
  "b tree": "B-trees",
  indexing: "Indexing",
  "multivalued dependency 4nf": "Normalization",

  // Computer Networks
  "ip addressing": "IP",
  subnetting: "IP",
  "ip packet": "IP",
  fragmentation: "IP",
  tcp: "TCP",
  "sliding window": "TCP",
  "stop and wait": "TCP",
  "congestion control": "TCP",
  udp: "UDP",
  routing: "Routing",
  "distance vector routing": "Routing",
  "routing protocols": "Routing",
  "application layer protocols": "Application-layer concepts",
  sockets: "Application-layer concepts",
  "csma cd": "LAN-related protocols and concepts",
  "pure aloha": "LAN-related protocols and concepts",
  "slotted aloha": "LAN-related protocols and concepts",
  "mac protocol": "LAN-related protocols and concepts",
  ethernet: "LAN-related protocols and concepts",
  "token bucket": "Network software concepts",
  "osi model": "ISO/OSI reference model",
};

/** Body text longer than this is almost certainly a parsing error, not a question. */
export const MAX_STATEMENT_CHARS = 8000;

/** Chapters in the source that this app deliberately does not import. */
export const SKIPPED_CHAPTER_PREFIX = "Non GATE CSE";
