import "dotenv/config";
import { runResearch } from "../src/lib/research/loop";
import { db } from "../src/lib/db";
try {
  const result = await runResearch({ trigger: "MANUAL" });
  console.log(JSON.stringify(result));
  if (result.status === "FAILED") process.exitCode = 1;
} catch {
  console.error(
    "Araştırma çalışması başarısız; kaynak ve çalışma günlüğünü inceleyin.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
