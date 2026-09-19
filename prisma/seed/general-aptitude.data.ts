/**
 * General Aptitude section.
 *
 * NOT part of the syllabus_details.md you supplied — that file only
 * covered the 10 CSE/IT subjects (55 units). This is a placeholder built
 * from GATE's standard, publicly-documented GA structure so the "55-unit
 * + General Aptitude" scope from the architecture doc has somewhere to
 * live. Replace the concept lists below with your own breakdown whenever
 * you have one — nothing else in the app depends on these exact names.
 */
import type { SyllabusSubjectSeed } from "./syllabus.data";

export const GENERAL_APTITUDE_SUBJECT: SyllabusSubjectSeed = {
  code: "GA",
  name: "General Aptitude",
  units: [
    {
      code: "GA.1",
      name: "Verbal Aptitude",
      concepts: [
        { name: "Grammar and sentence correction" },
        { name: "Vocabulary" },
        { name: "Reading comprehension" },
        { name: "Verbal deduction" },
      ],
    },
    {
      code: "GA.2",
      name: "Quantitative Aptitude",
      concepts: [
        { name: "Data interpretation" },
        { name: "Ratio and proportion" },
        { name: "Percentages" },
        { name: "Permutations and combinations" },
        { name: "Mensuration and geometry" },
      ],
    },
    {
      code: "GA.3",
      name: "Analytical Aptitude",
      concepts: [
        { name: "Logical deduction" },
        { name: "Analogies" },
        { name: "Numerical relations" },
        { name: "Sequences and series" },
      ],
    },
    {
      code: "GA.4",
      name: "Spatial Aptitude",
      concepts: [
        { name: "Transformation of shapes" },
        { name: "Group and assembly of figures" },
        { name: "Paper folding and cutting" },
      ],
    },
  ],
};
