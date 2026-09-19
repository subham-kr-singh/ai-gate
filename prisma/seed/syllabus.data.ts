/**
 * Canonical syllabus data — transcribed directly from the user-supplied
 * syllabus_details.md (10 subjects, 55 units total — matches the "55-unit
 * structure" referenced as authoritative in GATE_AI_ARCHITECTURE_UPDATED_V1.md).
 *
 * Subject/unit names, ordering, and terminology are preserved exactly as
 * given — this is imported as structured data, not regenerated from model
 * knowledge (see architecture doc, "Current Syllabus Is the Source of
 * Truth").
 *
 * Shape: each Unit's bullet list becomes its Concepts. syllabus_details.md
 * does not give a separate Topic layer below Unit, so each Unit gets one
 * pass-through Topic of the same name — this keeps the Subject → Unit →
 * Topic → Concept hierarchy from the architecture doc intact without
 * inventing topic names that aren't in the source.
 */

export interface SyllabusConceptSeed {
  name: string;
}

export interface SyllabusUnitSeed {
  code: string; // e.g. "1.1"
  name: string;
  concepts: SyllabusConceptSeed[];
}

export interface SyllabusSubjectSeed {
  code: string; // e.g. "1"
  name: string;
  units: SyllabusUnitSeed[];
}

export const SYLLABUS_SUBJECTS: SyllabusSubjectSeed[] = [
  {
    code: "1",
    name: "Discrete & Engineering Mathematics",
    units: [
      {
        code: "1.1",
        name: "Mathematical Logic",
        concepts: [
          { name: "Propositional logic" },
          { name: "First-order logic" },
        ],
      },
      {
        code: "1.2",
        name: "Set Theory & Algebra",
        concepts: [
          { name: "Sets" },
          { name: "Relations" },
          { name: "Functions" },
          { name: "Partial orders" },
          { name: "Lattices" },
          { name: "Groups" },
        ],
      },
      {
        code: "1.3",
        name: "Combinatorics",
        concepts: [
          { name: "Counting" },
          { name: "Recurrence relations" },
          { name: "Generating functions" },
        ],
      },
      {
        code: "1.4",
        name: "Graph Theory",
        concepts: [
          { name: "Connectivity" },
          { name: "Matching" },
          { name: "Coloring" },
        ],
      },
      {
        code: "1.5",
        name: "Probability",
        concepts: [
          { name: "Random variables" },
          { name: "Uniform distribution" },
          { name: "Normal distribution" },
          { name: "Exponential distribution" },
          { name: "Poisson distribution" },
          { name: "Binomial distribution" },
          { name: "Mean" },
          { name: "Median" },
          { name: "Standard deviation" },
          { name: "Conditional probability" },
          { name: "Bayes theorem" },
        ],
      },
      {
        code: "1.6",
        name: "Linear Algebra",
        concepts: [
          { name: "Matrices" },
          { name: "Determinants" },
          { name: "Systems of linear equations" },
          { name: "Eigenvalues" },
          { name: "Eigenvectors" },
          { name: "Linear transformations / decomposition" },
        ],
      },
      {
        code: "1.7",
        name: "Calculus",
        concepts: [
          { name: "Limits" },
          { name: "Continuity" },
          { name: "Differentiability" },
          { name: "Maxima and minima" },
          { name: "Mean value theorem" },
          { name: "Integration" },
        ],
      },
    ],
  },
  {
    code: "2",
    name: "Theory of Computation",
    units: [
      {
        code: "2.1",
        name: "Finite Automata & Regular Languages",
        concepts: [
          { name: "Finite automata" },
          { name: "Regular languages" },
          { name: "Regular expressions" },
          { name: "Properties of regular languages" },
        ],
      },
      {
        code: "2.2",
        name: "Pushdown Automata & Context-Free Languages",
        concepts: [
          { name: "Pushdown automata" },
          { name: "Context-free languages" },
          { name: "Deterministic context-free languages" },
          { name: "Context-free grammars" },
        ],
      },
      {
        code: "2.3",
        name: "Turing Machines",
        concepts: [
          { name: "Turing machines" },
          { name: "Recursively enumerable languages" },
          { name: "Recursive languages" },
          { name: "Undecidability" },
        ],
      },
    ],
  },
  {
    code: "3",
    name: "Digital Logic",
    units: [
      {
        code: "3.1",
        name: "Logic Functions & Minimization",
        concepts: [
          { name: "Boolean algebra" },
          { name: "Logic functions" },
          { name: "Boolean function representation" },
          { name: "Minimization" },
        ],
      },
      {
        code: "3.2",
        name: "Combinational Circuits",
        concepts: [
          { name: "Combinational logic" },
          { name: "Standard combinational building blocks" },
          { name: "Circuit design and analysis" },
        ],
      },
      {
        code: "3.3",
        name: "Sequential Circuits",
        concepts: [
          { name: "Sequential logic" },
          { name: "State-based circuit design" },
          { name: "Sequential circuit analysis" },
        ],
      },
      {
        code: "3.4",
        name: "Number Systems",
        concepts: [
          { name: "Number representation" },
          { name: "Binary arithmetic" },
          { name: "Number-system conversions" },
        ],
      },
    ],
  },
  {
    code: "4",
    name: "Computer Organization & Architecture",
    units: [
      {
        code: "4.1",
        name: "CPU Architecture & Addressing Modes",
        concepts: [
          { name: "CPU organization" },
          { name: "Instruction representation" },
          { name: "Instruction execution" },
          { name: "Addressing modes" },
        ],
      },
      {
        code: "4.2",
        name: "Control Unit Design",
        concepts: [
          { name: "Control-unit organization" },
          { name: "Control signals" },
          { name: "Instruction control" },
          { name: "Control-unit design" },
        ],
      },
      {
        code: "4.3",
        name: "Instruction Pipelining",
        concepts: [
          { name: "Pipelining" },
          { name: "Pipeline stages" },
          { name: "Pipeline performance" },
          { name: "Pipeline hazards" },
        ],
      },
      {
        code: "4.4",
        name: "Memory Organization",
        concepts: [
          { name: "Memory hierarchy" },
          { name: "Memory organization" },
          { name: "Cache and related memory concepts" },
        ],
      },
      {
        code: "4.5",
        name: "Input/Output Organization",
        concepts: [
          { name: "I/O organization" },
          { name: "I/O mechanisms" },
          { name: "Device communication" },
        ],
      },
    ],
  },
  {
    code: "5",
    name: "Programming & Data Structures",
    units: [
      {
        code: "5.1",
        name: "Programming",
        concepts: [
          { name: "Programming in C" },
          { name: "Functions" },
          { name: "Recursion" },
          { name: "Parameter passing" },
          { name: "Scope" },
          { name: "Binding" },
          { name: "Abstract data types" },
        ],
      },
      {
        code: "5.2",
        name: "Arrays",
        concepts: [
          { name: "Array representation" },
          { name: "Array operations" },
          { name: "Applications of arrays" },
        ],
      },
      {
        code: "5.3",
        name: "Stacks & Queues",
        concepts: [
          { name: "Stacks" },
          { name: "Stack operations" },
          { name: "Queues" },
          { name: "Queue operations" },
          { name: "Applications" },
        ],
      },
      {
        code: "5.4",
        name: "Linked Lists",
        concepts: [
          { name: "Linked-list representation" },
          { name: "Linked-list operations" },
          { name: "Variants and applications" },
        ],
      },
      {
        code: "5.5",
        name: "Trees",
        concepts: [
          { name: "Trees" },
          { name: "Binary trees" },
          { name: "Binary search trees" },
          { name: "Tree operations" },
        ],
      },
      {
        code: "5.6",
        name: "Graphs",
        concepts: [
          { name: "Graph representation" },
          { name: "Graph traversal" },
          { name: "Graph operations" },
        ],
      },
      {
        code: "5.7",
        name: "Hashing",
        concepts: [
          { name: "Hash tables" },
          { name: "Hash functions" },
          { name: "Collision handling" },
          { name: "Hashing applications" },
        ],
      },
    ],
  },
  {
    code: "6",
    name: "Algorithms",
    units: [
      {
        code: "6.1",
        name: "Algorithm Analysis & Asymptotic Notations",
        concepts: [
          { name: "Algorithm analysis" },
          { name: "Time complexity" },
          { name: "Space complexity" },
          { name: "Asymptotic analysis" },
          { name: "Best-case analysis" },
          { name: "Worst-case analysis" },
          { name: "Average-case analysis" },
          { name: "Asymptotic notations" },
          { name: "Lower and upper bounds" },
        ],
      },
      {
        code: "6.2",
        name: "Divide and Conquer",
        concepts: [
          { name: "Divide-and-conquer strategy" },
          { name: "Recursive decomposition" },
          { name: "Divide-and-conquer algorithms" },
        ],
      },
      {
        code: "6.3",
        name: "Greedy Method",
        concepts: [
          { name: "Greedy strategy" },
          { name: "Greedy-choice property" },
          { name: "Greedy algorithms" },
        ],
      },
      {
        code: "6.4",
        name: "Dynamic Programming",
        concepts: [
          { name: "Dynamic-programming strategy" },
          { name: "Optimal substructure" },
          { name: "Overlapping subproblems" },
          { name: "Dynamic-programming algorithms" },
        ],
      },
      {
        code: "6.5",
        name: "P and NP Concepts",
        concepts: [
          { name: "P" },
          { name: "NP" },
          { name: "NP-complete concepts" },
          { name: "NP-hard concepts" },
        ],
      },
      {
        code: "6.6",
        name: "Graph & Tree Algorithms",
        concepts: [
          { name: "Tree traversal" },
          { name: "Graph traversal" },
          { name: "Connected components" },
          { name: "Spanning trees" },
          { name: "Shortest paths" },
        ],
      },
      {
        code: "6.7",
        name: "Fundamental Algorithmic Topics",
        concepts: [
          { name: "Hashing" },
          { name: "Sorting" },
          { name: "Searching" },
        ],
      },
    ],
  },
  {
    code: "7",
    name: "Compiler Design",
    units: [
      {
        code: "7.1",
        name: "Lexical Analysis",
        concepts: [
          { name: "Tokens" },
          { name: "Lexemes" },
          { name: "Lexical analysis" },
          { name: "Regular-expression based tokenization" },
        ],
      },
      {
        code: "7.2",
        name: "Parsing Techniques",
        concepts: [
          { name: "Syntax analysis" },
          { name: "Parsing" },
          { name: "Grammar-based parsing" },
          { name: "Parsing techniques" },
        ],
      },
      {
        code: "7.3",
        name: "Syntax-Directed Translation",
        concepts: [
          { name: "Syntax-directed definitions" },
          { name: "Syntax-directed translation" },
          { name: "Attribute-based translation" },
        ],
      },
      {
        code: "7.4",
        name: "Runtime Environments",
        concepts: [
          { name: "Runtime environment" },
          { name: "Storage organization" },
          { name: "Procedure activation" },
          { name: "Parameter handling" },
        ],
      },
      {
        code: "7.5",
        name: "Intermediate & Target Code Generation",
        concepts: [
          { name: "Intermediate representation" },
          { name: "Intermediate-code generation" },
          { name: "Target-code generation" },
        ],
      },
      {
        code: "7.6",
        name: "Code Optimization",
        concepts: [
          { name: "Local optimization" },
          { name: "Data-flow analysis" },
          { name: "Constant propagation" },
          { name: "Liveness analysis" },
          { name: "Common-subexpression elimination" },
          { name: "Code optimization" },
        ],
      },
    ],
  },
  {
    code: "8",
    name: "Operating Systems",
    units: [
      {
        code: "8.1",
        name: "Process Management I",
        concepts: [
          { name: "Introduction to operating systems" },
          { name: "Processes" },
          { name: "Threads" },
          { name: "CPU scheduling" },
        ],
      },
      {
        code: "8.2",
        name: "Process Management II",
        concepts: [
          { name: "Inter-process communication" },
          { name: "Synchronization" },
          { name: "Concurrency" },
        ],
      },
      {
        code: "8.3",
        name: "Deadlock",
        concepts: [
          { name: "Deadlock concepts" },
          { name: "Deadlock handling" },
          { name: "Deadlock avoidance and related techniques" },
        ],
      },
      {
        code: "8.4",
        name: "Memory Management & Virtual Memory",
        concepts: [
          { name: "Memory management" },
          { name: "Virtual memory" },
          { name: "Address-space management" },
          { name: "Memory allocation concepts" },
        ],
      },
      {
        code: "8.5",
        name: "File System & Device Management",
        concepts: [
          { name: "File systems" },
          { name: "File management" },
          { name: "I/O systems" },
          { name: "Device management" },
        ],
      },
      {
        code: "8.6",
        name: "Miscellaneous",
        concepts: [{ name: "Other operating-system concepts" }],
      },
    ],
  },
  {
    code: "9",
    name: "Databases",
    units: [
      {
        code: "9.1",
        name: "ER Model",
        concepts: [
          { name: "Entity-relationship model" },
          { name: "Entities" },
          { name: "Attributes" },
          { name: "Relationships" },
          { name: "ER modeling" },
        ],
      },
      {
        code: "9.2",
        name: "Database Design",
        concepts: [
          { name: "Functional dependencies" },
          { name: "Normalization" },
          { name: "Database design" },
          { name: "Integrity constraints" },
        ],
      },
      {
        code: "9.3",
        name: "Structured Query Language (SQL)",
        concepts: [
          { name: "SQL" },
          { name: "Data definition" },
          { name: "Data manipulation" },
          { name: "Query processing concepts" },
        ],
      },
      {
        code: "9.4",
        name: "Relational Model",
        concepts: [
          { name: "Relational model" },
          { name: "Relational algebra" },
          { name: "Tuple calculus" },
        ],
      },
      {
        code: "9.5",
        name: "Transactions & Concurrency Control",
        concepts: [
          { name: "Transactions" },
          { name: "Concurrency" },
          { name: "Concurrency control" },
          { name: "Transaction-related concepts" },
        ],
      },
      {
        code: "9.6",
        name: "File Structures",
        concepts: [
          { name: "File organization" },
          { name: "Sequential files" },
          { name: "Indexing" },
          { name: "B-trees" },
          { name: "B+ trees" },
        ],
      },
    ],
  },
  {
    code: "10",
    name: "Computer Networks",
    units: [
      {
        code: "10.1",
        name: "ISO/OSI Stack & Software",
        concepts: [
          { name: "ISO/OSI reference model" },
          { name: "Layered network architecture" },
          { name: "Network software concepts" },
        ],
      },
      {
        code: "10.2",
        name: "LAN",
        concepts: [
          { name: "Local area networks" },
          { name: "LAN architecture" },
          { name: "LAN-related protocols and concepts" },
        ],
      },
      {
        code: "10.3",
        name: "TCP, UDP & IP",
        concepts: [
          { name: "TCP" },
          { name: "UDP" },
          { name: "IP" },
          { name: "Transport-layer concepts" },
          { name: "Internet-layer concepts" },
        ],
      },
      {
        code: "10.4",
        name: "Routing & Application Layer",
        concepts: [
          { name: "Routing" },
          { name: "Routing concepts and protocols" },
          { name: "Application-layer concepts" },
          { name: "Network applications" },
        ],
      },
    ],
  },
];
