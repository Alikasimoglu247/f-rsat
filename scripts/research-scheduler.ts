import "dotenv/config";
import { db } from "../src/lib/db";
import { startResearchScheduler } from "../src/lib/research/scheduler";
import { ResearchWorkerAlreadyRunningError } from "../src/lib/research/worker-lock";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--probe"))
  throw new Error("Kullanım: tsx scripts/research-scheduler.ts [--probe]");
const probe = args.includes("--probe");
const { runResearch } = await import("../src/lib/research/loop");
let scheduler: Awaited<ReturnType<typeof startResearchScheduler>>;
try {
  scheduler = await startResearchScheduler({
    probe,
    run: ({ trigger }) => runResearch({ trigger }),
    onEvent: (event) => console.info(JSON.stringify(event)),
  });
} catch (error) {
  await db.$disconnect();
  if (error instanceof ResearchWorkerAlreadyRunningError) {
    console.error(
      "Araştırma worker'ı zaten çalışıyor; ikinci süreç başlatılmadı.",
    );
    process.exit(73);
  }
  throw error;
}

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
