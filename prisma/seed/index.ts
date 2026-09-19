/**
 * Seed entrypoint. Run with: npm run seed
 *
 * Idempotent — safe to re-run. Upserts by natural keys (syllabus label,
 * subject/unit code, topic/concept name within parent) rather than
 * inserting blindly, so re-seeding after an edit to syllabus.data.ts
 * updates existing rows instead of duplicating them.
 */
import { PrismaClient } from "@prisma/client";
import { SYLLABUS_SUBJECTS } from "./syllabus.data";
import { GENERAL_APTITUDE_SUBJECT } from "./general-aptitude.data";

const prisma = new PrismaClient();

const SYLLABUS_LABEL = "GATE CSE/IT — current";

async function main() {
  console.log(`Seeding syllabus version "${SYLLABUS_LABEL}"...`);

  let syllabusVersion = await prisma.syllabusVersion.findFirst({
    where: { label: SYLLABUS_LABEL },
  });
  syllabusVersion = syllabusVersion
    ? await prisma.syllabusVersion.update({
        where: { id: syllabusVersion.id },
        data: { isActive: true },
      })
    : await prisma.syllabusVersion.create({
        data: { label: SYLLABUS_LABEL, isActive: true },
      });

  const existingExam = await prisma.exam.findFirst({
    where: { syllabusVersionId: syllabusVersion.id },
  });
  if (!existingExam) {
    await prisma.exam.create({
      data: { name: "GATE CSE/IT", syllabusVersionId: syllabusVersion.id },
    });
  }

  const allSubjects = [...SYLLABUS_SUBJECTS, GENERAL_APTITUDE_SUBJECT];

  let subjectOrder = 0;
  for (const subjectSeed of allSubjects) {
    subjectOrder += 1;
    const subject = await prisma.subject.upsert({
      where: {
        syllabusVersionId_code: {
          syllabusVersionId: syllabusVersion.id,
          code: subjectSeed.code,
        },
      },
      update: { name: subjectSeed.name, order: subjectOrder },
      create: {
        syllabusVersionId: syllabusVersion.id,
        code: subjectSeed.code,
        name: subjectSeed.name,
        order: subjectOrder,
      },
    });

    let unitOrder = 0;
    for (const unitSeed of subjectSeed.units) {
      unitOrder += 1;
      const unit = await prisma.unit.upsert({
        where: { subjectId_code: { subjectId: subject.id, code: unitSeed.code } },
        update: { name: unitSeed.name, order: unitOrder },
        create: {
          subjectId: subject.id,
          code: unitSeed.code,
          name: unitSeed.name,
          order: unitOrder,
        },
      });

      // Pass-through Topic — see comment in syllabus.data.ts.
      const existingTopic = await prisma.topic.findFirst({ where: { unitId: unit.id } });
      const topic = existingTopic
        ? await prisma.topic.update({
            where: { id: existingTopic.id },
            data: { name: unitSeed.name, order: 1 },
          })
        : await prisma.topic.create({
            data: { unitId: unit.id, name: unitSeed.name, order: 1 },
          });

      let conceptOrder = 0;
      for (const conceptSeed of unitSeed.concepts) {
        conceptOrder += 1;
        const existingConcept = await prisma.concept.findFirst({
          where: { topicId: topic.id, name: conceptSeed.name },
        });
        if (existingConcept) {
          await prisma.concept.update({
            where: { id: existingConcept.id },
            data: { order: conceptOrder },
          });
        } else {
          await prisma.concept.create({
            data: { topicId: topic.id, name: conceptSeed.name, order: conceptOrder },
          });
        }
      }
    }
  }

  const subjectCount = await prisma.subject.count({
    where: { syllabusVersionId: syllabusVersion.id },
  });
  const unitCount = await prisma.unit.count({
    where: { subject: { syllabusVersionId: syllabusVersion.id } },
  });
  const conceptCount = await prisma.concept.count({
    where: { topic: { unit: { subject: { syllabusVersionId: syllabusVersion.id } } } },
  });

  console.log(
    `Seeded ${subjectCount} subjects, ${unitCount} units, ${conceptCount} concepts.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
