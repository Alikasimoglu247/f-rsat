import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { radarDb?: PrismaClient };
export const db =
  globalDb.radarDb ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
if (process.env.NODE_ENV !== "production") globalDb.radarDb = db;
