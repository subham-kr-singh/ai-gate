import type { SubjectSeed } from "./syllabus.data";

// General Aptitude — standard GATE GA structure (Verbal + Numerical/
// Quantitative Ability). Kept as its own Subject so it slots into the
// same Subject → Unit → Topic → Concept model without special-casing.
// If the student's actual syllabus source lists GA differently, replace
// this file's content directly rather than deriving it elsewhere.

function unit(name: string, bullets: string[]) {
  return { name, topics: [{ name, concepts: bullets.map((b) => ({ name: b })) }] };
}

export const generalAptitudeSubject: SubjectSeed = {
  code: "GA",
  name: "General Aptitude",
  units: [
    unit("Verbal Aptitude", [
      "English grammar",
      "Sentence completion",
      "Verbal analogies",
      "Word groups",
      "Instructions",
      "Critical reasoning",
      "Verbal deduction",
    ]),
    unit("Quantitative Aptitude", [
      "Data interpretation",
      "Graphs, tables, charts",
      "Numerical computation",
      "Numerical estimation",
      "Numerical reasoning",
      "Ratio and proportion",
      "Percentages",
      "Profit and loss",
      "Simple and compound interest",
      "Time, speed and distance",
      "Permutations and combinations",
    ]),
    unit("Analytical Aptitude", [
      "Logic: deduction and induction",
      "Analogy",
      "Numerical relations",
      "Logical sequences",
    ]),
    unit("Spatial Aptitude", [
      "Transformation of shapes",
      "Assembling and grouping of figures",
      "Paper folding",
      "Cutting and rotation",
    ]),
  ],
};
