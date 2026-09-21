// Part 1 dependency — server/db/client.ts is specified in PROJECT_PLAN.md
// Part 1 ("Prisma client singleton"). This file is included only so Part
// 4's imports resolve; if your repo already has a real Part 1
// implementation, keep that one and delete this stub.

import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const db = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = db;
}
