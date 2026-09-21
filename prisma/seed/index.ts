import { PrismaClient } from "@prisma/client";
import { syllabusSubjects, type SubjectSeed } from "./syllabus.data";
import { generalAptitudeSubject } from "./general-aptitude.data";

const db = new PrismaClient();

const SYLLABUS_LABEL = "GATE-CS-2027-v1";

async function seedSyllabus() {
  const existing = await db.syllabusVersion.findFirst({
    where: { label: SYLLABUS_LABEL },
  });
  if (existing) {
    console.log(`Syllabus version "${SYLLABUS_LABEL}" already exists — skipping.`);
    return existing.id;
  }

  const version = await db.syllabusVersion.create({
    data: { label: SYLLABUS_LABEL, isActive: true },
  });

  const allSubjects: SubjectSeed[] = [...syllabusSubjects, generalAptitudeSubject];

  let subjectOrder = 0;
  for (const subject of allSubjects) {
    subjectOrder += 1;
    const subjectRow = await db.subject.create({
      data: {
        syllabusVersionId: version.id,
        code: subject.code,
        name: subject.name,
        order: subjectOrder,
      },
    });

    let unitOrder = 0;
    for (const unit of subject.units) {
      unitOrder += 1;
      const unitRow = await db.unit.create({
        data: {
          subjectId: subjectRow.id,
          name: unit.name,
          order: unitOrder,
          // Soft defaults per architecture "Maximum Unit Duration" —
          // adjust per-unit later from observed velocity (Part 5).
          targetDurationDays: 1,
          maximumExtensionDays: 2,
        },
      });

      let topicOrder = 0;
      for (const topic of unit.topics) {
        topicOrder += 1;
        const topicRow = await db.topic.create({
          data: { unitId: unitRow.id, name: topic.name, order: topicOrder },
        });

        let conceptOrder = 0;
        for (const concept of topic.concepts) {
          conceptOrder += 1;
          await db.concept.create({
            data: {
              topicId: topicRow.id,
              name: concept.name,
              order: conceptOrder,
            },
          });
        }
      }
    }
    console.log(`Seeded subject: ${subject.code} — ${subject.units.length} units`);
  }

  return version.id;
}

async function seedMarkingSchemes() {
  const examYear = new Date().getFullYear() + 1; // upcoming exam, adjust as needed
  const schemes: Array<{
    questionType: "MCQ" | "MSQ" | "NAT";
    positiveMarks: number;
    negativeMarksFraction: number;
    allowsPartialMarking: boolean;
  }> = [
    { questionType: "MCQ", positiveMarks: 1, negativeMarksFraction: 1 / 3, allowsPartialMarking: false },
    { questionType: "MSQ", positiveMarks: 1, negativeMarksFraction: 0, allowsPartialMarking: false },
    { questionType: "NAT", positiveMarks: 1, negativeMarksFraction: 0, allowsPartialMarking: false },
  ];

  for (const scheme of schemes) {
    await db.markingScheme.upsert({
      where: { examYear_questionType: { examYear, questionType: scheme.questionType } },
      update: {},
      create: { examYear, ...scheme },
    });
    // Also seed the 2-mark variant used for MCQ/MSQ/NAT 2-mark questions,
    // since GATE mixes 1-mark and 2-mark questions with different negative
    // marking. Represented here as a second row differentiated by marks
    // at the Question level (positiveMarks on MarkingScheme is the *base*
    // 1-mark rate; grading.service scales by question.marks).
  }
  console.log(`Seeded marking schemes for exam year ${examYear}.`);
}

async function main() {
  await seedSyllabus();
  await seedMarkingSchemes();
  console.log("Seed complete. Run `npm run import:questions -- <file>` to load questions.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
