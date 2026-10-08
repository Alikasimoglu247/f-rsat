import pg from "pg";
import { spawnSync } from "node:child_process";
export async function resetE2eFixtures() {
  const target = process.env.DATABASE_URL;
  if (!target || !new URL(target).pathname.endsWith("_e2e"))
    throw new Error("Yalnızca ayrı E2E veritabanı temizlenebilir.");
  const pool = new pg.Pool({ connectionString: target });
  try {
    await pool.query(
      'TRUNCATE TABLE "Listing", "ListingSource", "ImportJob", "AnalysisRun", "AppSettings", "SearchProfile", "EmailMessage", "EmailTemplate", "MailboxConnection", "OAuthAttempt" CASCADE',
    );
  } finally {
    await pool.end();
  }
  const seed = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
    env: process.env,
    stdio: "pipe",
  });
  if (seed.status !== 0) throw new Error("E2E fixture seed başarısız.");
}
