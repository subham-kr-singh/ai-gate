// Hand-encoded from syllabus_details.md — Subject → Unit(=the numbered
// "1.1", "1.2" ... sections) → Topic(=each bullet's own sub-concept grouping)
// → Concept(=individual bullet). This file is the authoritative syllabus
// content; do not regenerate it from model knowledge (architecture:
// "Current Syllabus Is the Source of Truth").
//
// NOTE ON HIERARCHY MAPPING: syllabus_details.md uses a 2-level hierarchy
// (Subject → numbered subsection, each with a flat bullet list). We map
// each numbered subsection ("1.1 Mathematical Logic") to a Unit, and
// group its bullets into a single Topic of the same name holding one
// Concept per bullet. This keeps every bullet individually trackable
// (mastery/attempts are Concept-level) while preserving the exact
// subject/unit names and ordering from the source document.

export interface ConceptSeed {
  name: string;
}
export interface TopicSeed {
  name: string;
  concepts: ConceptSeed[];
}
export interface UnitSeed {
  name: string;
  topics: TopicSeed[];
}
export interface SubjectSeed {
  code: string;
  name: string;
  units: UnitSeed[];
}

function unit(name: string, bullets: string[]): UnitSeed {
  return { name, topics: [{ name, concepts: bullets.map((b) => ({ name: b })) }] };
}

export const syllabusSubjects: SubjectSeed[] = [
  {
    code: "MATH",
    name: "Discrete & Engineering Mathematics",
    units: [
      unit("Mathematical Logic", ["Propositional logic", "First-order logic"]),
      unit("Set Theory & Algebra", [
        "Sets",
        "Relations",
        "Functions",
        "Partial orders",
        "Lattices",
        "Groups",
      ]),
      unit("Combinatorics", [
        "Counting",
        "Recurrence relations",
        "Generating functions",
      ]),
      unit("Graph Theory", ["Connectivity", "Matching", "Coloring"]),
      unit("Probability", [
        "Random variables",
        "Uniform distribution",
        "Normal distribution",
        "Exponential distribution",
        "Poisson distribution",
        "Binomial distribution",
        "Mean",
        "Median",
        "Standard deviation",
        "Conditional probability",
        "Bayes theorem",
      ]),
      unit("Linear Algebra", [
        "Matrices",
        "Determinants",
        "Systems of linear equations",
        "Eigenvalues",
        "Eigenvectors",
        "Linear transformations / decomposition",
      ]),
      unit("Calculus", [
        "Limits",
        "Continuity",
        "Differentiability",
        "Maxima and minima",
        "Mean value theorem",
        "Integration",
      ]),
    ],
  },
  {
    code: "TOC",
    name: "Theory of Computation",
    units: [
      unit("Finite Automata & Regular Languages", [
        "Finite automata",
        "Regular languages",
        "Regular expressions",
        "Properties of regular languages",
      ]),
      unit("Pushdown Automata & Context-Free Languages", [
        "Pushdown automata",
        "Context-free languages",
        "Deterministic context-free languages",
        "Context-free grammars",
      ]),
      unit("Turing Machines", [
        "Turing machines",
        "Recursively enumerable languages",
        "Recursive languages",
        "Undecidability",
      ]),
    ],
  },
  {
    code: "DL",
    name: "Digital Logic",
    units: [
      unit("Logic Functions & Minimization", [
        "Boolean algebra",
        "Logic functions",
        "Boolean function representation",
        "Minimization",
      ]),
      unit("Combinational Circuits", [
        "Combinational logic",
        "Standard combinational building blocks",
        "Circuit design and analysis",
      ]),
      unit("Sequential Circuits", [
        "Sequential logic",
        "State-based circuit design",
        "Sequential circuit analysis",
      ]),
      unit("Number Systems", [
        "Number representation",
        "Binary arithmetic",
        "Number-system conversions",
      ]),
    ],
  },
  {
    code: "COA",
    name: "Computer Organization & Architecture",
    units: [
      unit("CPU Architecture & Addressing Modes", [
        "CPU organization",
        "Instruction representation",
        "Instruction execution",
        "Addressing modes",
      ]),
      unit("Control Unit Design", [
        "Control-unit organization",
        "Control signals",
        "Instruction control",
        "Control-unit design",
      ]),
      unit("Instruction Pipelining", [
        "Pipelining",
        "Pipeline stages",
        "Pipeline performance",
        "Pipeline hazards",
      ]),
      unit("Memory Organization", [
        "Memory hierarchy",
        "Memory organization",
        "Cache and related memory concepts",
      ]),
      unit("Input/Output Organization", [
        "I/O organization",
        "I/O mechanisms",
        "Device communication",
      ]),
    ],
  },
  {
    code: "PDS",
    name: "Programming & Data Structures",
    units: [
      unit("Programming", [
        "Programming in C",
        "Functions",
        "Recursion",
        "Parameter passing",
        "Scope",
        "Binding",
        "Abstract data types",
      ]),
      unit("Arrays", [
        "Array representation",
        "Array operations",
        "Applications of arrays",
      ]),
      unit("Stacks & Queues", [
        "Stacks",
        "Stack operations",
        "Queues",
        "Queue operations",
        "Applications",
      ]),
      unit("Linked Lists", [
        "Linked-list representation",
        "Linked-list operations",
        "Variants and applications",
      ]),
      unit("Trees", ["Trees", "Binary trees", "Binary search trees", "Tree operations"]),
      unit("Graphs", ["Graph representation", "Graph traversal", "Graph operations"]),
      unit("Hashing", [
        "Hash tables",
        "Hash functions",
        "Collision handling",
        "Hashing applications",
      ]),
    ],
  },
  {
    code: "ALGO",
    name: "Algorithms",
    units: [
      unit("Algorithm Analysis & Asymptotic Notations", [
        "Algorithm analysis",
        "Time complexity",
        "Space complexity",
        "Asymptotic analysis",
        "Best-case analysis",
        "Worst-case analysis",
        "Average-case analysis",
        "Asymptotic notations",
        "Lower and upper bounds",
      ]),
      unit("Divide and Conquer", [
        "Divide-and-conquer strategy",
        "Recursive decomposition",
        "Divide-and-conquer algorithms",
      ]),
      unit("Greedy Method", [
        "Greedy strategy",
        "Greedy-choice property",
        "Greedy algorithms",
      ]),
      unit("Dynamic Programming", [
        "Dynamic-programming strategy",
        "Optimal substructure",
        "Overlapping subproblems",
        "Dynamic-programming algorithms",
      ]),
      unit("P and NP Concepts", ["P", "NP", "NP-complete concepts", "NP-hard concepts"]),
      unit("Graph & Tree Algorithms", [
        "Tree traversal",
        "Graph traversal",
        "Connected components",
        "Spanning trees",
        "Shortest paths",
      ]),
      unit("Fundamental Algorithmic Topics", ["Hashing", "Sorting", "Searching"]),
    ],
  },
  {
    code: "CD",
    name: "Compiler Design",
    units: [
      unit("Lexical Analysis", [
        "Tokens",
        "Lexemes",
        "Lexical analysis",
        "Regular-expression based tokenization",
      ]),
      unit("Parsing Techniques", [
        "Syntax analysis",
        "Parsing",
        "Grammar-based parsing",
        "Parsing techniques",
      ]),
      unit("Syntax-Directed Translation", [
        "Syntax-directed definitions",
        "Syntax-directed translation",
        "Attribute-based translation",
      ]),
      unit("Runtime Environments", [
        "Runtime environment",
        "Storage organization",
        "Procedure activation",
        "Parameter handling",
      ]),
      unit("Intermediate & Target Code Generation", [
        "Intermediate representation",
        "Intermediate-code generation",
        "Target-code generation",
      ]),
      unit("Code Optimization", [
        "Local optimization",
        "Data-flow analysis",
        "Constant propagation",
        "Liveness analysis",
        "Common-subexpression elimination",
        "Code optimization",
      ]),
    ],
  },
  {
    code: "OS",
    name: "Operating Systems",
    units: [
      unit("Process Management I", [
        "Introduction to operating systems",
        "Processes",
        "Threads",
        "CPU scheduling",
      ]),
      unit("Process Management II", [
        "Inter-process communication",
        "Synchronization",
        "Concurrency",
      ]),
      unit("Deadlock", [
        "Deadlock concepts",
        "Deadlock handling",
        "Deadlock avoidance and related techniques",
      ]),
      unit("Memory Management & Virtual Memory", [
        "Memory management",
        "Virtual memory",
        "Address-space management",
        "Memory allocation concepts",
      ]),
      unit("File System & Device Management", [
        "File systems",
        "File management",
        "I/O systems",
        "Device management",
      ]),
      unit("Miscellaneous", ["Other operating-system concepts"]),
    ],
  },
  {
    code: "DBMS",
    name: "Databases",
    units: [
      unit("ER Model", [
        "Entity-relationship model",
        "Entities",
        "Attributes",
        "Relationships",
        "ER modeling",
      ]),
      unit("Database Design", [
        "Functional dependencies",
        "Normalization",
        "Database design",
        "Integrity constraints",
      ]),
      unit("Structured Query Language (SQL)", [
        "SQL",
        "Data definition",
        "Data manipulation",
        "Query processing concepts",
      ]),
      unit("Relational Model", [
        "Relational model",
        "Relational algebra",
        "Tuple calculus",
      ]),
      unit("Transactions & Concurrency Control", [
        "Transactions",
        "Concurrency",
        "Concurrency control",
        "Transaction-related concepts",
      ]),
      unit("File Structures", [
        "File organization",
        "Sequential files",
        "Indexing",
        "B-trees",
        "B+ trees",
      ]),
    ],
  },
  {
    code: "CN",
    name: "Computer Networks",
    units: [
      unit("ISO/OSI Stack & Software", [
        "ISO/OSI reference model",
        "Layered network architecture",
        "Network software concepts",
      ]),
      unit("LAN", [
        "Local area networks",
        "LAN architecture",
        "LAN-related protocols and concepts",
      ]),
      unit("TCP, UDP & IP", [
        "TCP",
        "UDP",
        "IP",
        "Transport-layer concepts",
        "Internet-layer concepts",
      ]),
      unit("Routing & Application Layer", [
        "Routing",
        "Routing concepts and protocols",
        "Application-layer concepts",
        "Network applications",
      ]),
    ],
  },
];
