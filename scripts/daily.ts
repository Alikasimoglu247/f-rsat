import "dotenv/config";
import { runDaily } from "../src/lib/jobs";
import { db } from "../src/lib/db";
try {
  console.log(
    JSON.stringify(
      await runDaily({ manual: process.argv.includes("--manual") }),
    ),
  );
} catch {
  console.error("Günlük iş başarısız.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
