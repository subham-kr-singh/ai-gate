import type { Prisma, PrismaClient } from "@prisma/client";

/** Either the singleton client or an interactive-transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;
