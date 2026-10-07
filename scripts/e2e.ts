import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
const configured =
  process.env.E2E_DATABASE_URL ??
  process.env.TEST_DATABASE_URL?.replace(/_test(?=\?|$)/, "_e2e");
if (!configured || !new URL(configured).pathname.endsWith("_e2e"))
  throw new Error("E2E için ayrı *_e2e veritabanı gerekli.");
const url = new URL(configured),
  name = url.pathname.slice(1);
if (!/^[a-z][a-z0-9_]*_e2e$/.test(name))
  throw new Error("Geçersiz test veritabanı adı.");
url.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: url.toString() });
try {
  const existing = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [name],
  );
  if (!existing.rowCount) await admin.query(`CREATE DATABASE "${name}"`);
} finally {
  await admin.end();
}
const testEnv = {
  ...process.env,
  DATABASE_URL: configured,
  APP_BASE_URL: "http://127.0.0.1:3001",
  APP_ACCESS_TOKEN: "",
  AI_ENABLED: "false",
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_CHAT_ID: "",
  SMTP_HOST: "",
  AUTHORIZED_FEED_URL: "",
};
function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { env: testEnv, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("npx", ["prisma", "migrate", "deploy"]);
const testDb = new pg.Pool({ connectionString: configured });
try {
  await testDb.query(
    'TRUNCATE TABLE "Listing", "ListingSource", "ImportJob", "AnalysisRun", "AppSettings", "SearchProfile" CASCADE',
  );
} finally {
  await testDb.end();
}
run("npx", ["tsx", "prisma/seed.ts"]);
run("npx", ["playwright", "test", ...process.argv.slice(2)]);
