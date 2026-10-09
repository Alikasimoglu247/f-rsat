import "dotenv/config";
import { db } from "../src/lib/db";
import { startResearchScheduler } from "../src/lib/research/scheduler";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--probe"))
  throw new Error("Kullanım: tsx scripts/research-scheduler.ts [--probe]");
const probe = args.includes("--probe");
const { runResearch } = await import("../src/lib/research/loop");
const scheduler = await startResearchScheduler({
  probe,
  run: ({ trigger }) => runResearch({ trigger }),
  onEvent: (event) => console.info(JSON.stringify(event)),
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await scheduler.stop();
  await db.$disconnect();
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void stop().then(() => process.exit(0));
  });
}
if (probe) {
  const tick = await scheduler.completion;
  await db.$disconnect();
  if (tick?.failed) process.exitCode = 1;
}
