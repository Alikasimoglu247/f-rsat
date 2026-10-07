import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
const target = process.env.TEST_DATABASE_URL;
if (!target) throw new Error("TEST_DATABASE_URL gerekli.");
const url = new URL(target),
  name = url.pathname.slice(1);
if (!/^[a-z][a-z0-9_]*_test$/.test(name))
  throw new Error("Yalnızca *_test veritabanı hazırlanabilir.");
url.pathname = "/postgres";
const pool = new pg.Pool({ connectionString: url.toString() });
try {
  const existing = await pool.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [name],
  );
  if (!existing.rowCount) await pool.query(`CREATE DATABASE "${name}"`);
} finally {
  await pool.end();
}
const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: target },
  stdio: "inherit",
});
if (migration.status !== 0) process.exit(migration.status ?? 1);
