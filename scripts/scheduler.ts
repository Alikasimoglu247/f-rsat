import "dotenv/config";
import cron from "node-cron";
import { runDaily } from "../src/lib/jobs";
import { db } from "../src/lib/db";
import { randomUUID } from "node:crypto";
import { heartbeatScheduler } from "../src/lib/scheduler-health";
const expression = process.env.DAILY_CRON ?? "0 9 * * *";
if (!cron.validate(expression)) throw new Error("DAILY_CRON geçersiz.");
const instanceId = randomUUID();
await heartbeatScheduler(instanceId, expression);
const heartbeat = setInterval(
  () =>
    void heartbeatScheduler(instanceId, expression).catch(() =>
      console.error(JSON.stringify({ event: "scheduler.heartbeat.failed" })),
    ),
  60_000,
);
const task = cron.schedule(
  expression,
  () =>
    runDaily()
      .then(async (result) => {
        await db.schedulerHealth.updateMany({
          where: { id: "personal", instanceId },
          data: { lastTickAt: new Date(), lastResult: result.status },
        });
        console.info(JSON.stringify({ event: "scheduler.tick", ...result }));
      })
      .catch(async () => {
        await db.schedulerHealth
          .updateMany({
            where: { id: "personal", instanceId },
            data: { lastTickAt: new Date(), lastResult: "FAILED" },
          })
          .catch(() => undefined);
        console.error(JSON.stringify({ event: "scheduler.failed" }));
      }),
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
    clearInterval(heartbeat);
    void (async () => {
      await task.stop();
      await db.schedulerHealth
        .updateMany({
          where: { id: "personal", instanceId },
          data: { status: "STOPPED" },
        })
        .catch(() => undefined);
      await db.$disconnect();
      process.exit(0);
    })();
  });
