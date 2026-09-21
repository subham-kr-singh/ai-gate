/** The exam year whose MarkingScheme rows are seeded and used for every
 * graded answer. GATE 2027 CS/IT, matching mock.blueprint.ts and
 * prisma/seed. Keep this the single source — grading throws rather than
 * guessing when a scheme is missing. */
export const GATE_EXAM_YEAR = 2027;
