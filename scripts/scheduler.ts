import "dotenv/config";
import cron from "node-cron";
import { runDaily } from "../src/lib/jobs";
const expression = process.env.DAILY_CRON ?? "0 9 * * *";
if (!cron.validate(expression)) throw new Error("DAILY_CRON geçersiz.");
const task = cron.schedule(
  expression,
  () =>
    runDaily()
      .then((result) =>
        console.info(JSON.stringify({ event: "scheduler.tick", ...result })),
      )
      .catch(() =>
        console.error(JSON.stringify({ event: "scheduler.failed" })),
      ),
  { timezone: "Europe/Istanbul", noOverlap: true },
);
console.info(
  JSON.stringify({
    event: "scheduler.started",
    schedule: expression,
    timezone: "Europe/Istanbul",
  }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void task.stop();
    process.exit(0);
  });
