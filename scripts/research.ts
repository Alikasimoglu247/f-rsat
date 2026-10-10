import "dotenv/config";
import { runResearch } from "../src/lib/research/loop";
import { db } from "../src/lib/db";
const args = process.argv.slice(2);
const rounds =
  args.length === 0
    ? 1
    : args[0] === "--rounds" && args.length === 2
      ? Number(args[1])
      : NaN;
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 6)
  throw new Error("Kullanım: npm run research -- [--rounds 1..6]");
try {
  for (let round = 1; round <= rounds; round++) {
    const result = await runResearch({ trigger: "MANUAL" });
    console.log(JSON.stringify({ round, ...result }));
    if (result.status === "FAILED") process.exitCode = 1;
    if (["RUNNING", "DEFERRED"].includes(result.status)) break;
    if (round < rounds)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} catch {
  console.error(
    "Araştırma çalışması başarısız; kaynak ve çalışma günlüğünü inceleyin.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
