import { db } from "./db";
export async function heartbeatScheduler(instanceId: string, schedule: string) {
  await db.schedulerHealth.upsert({
    where: { id: "personal" },
    create: {
      instanceId,
      status: "RUNNING",
      lastHeartbeatAt: new Date(),
      schedule,
    },
    update: {
      instanceId,
      status: "RUNNING",
      lastHeartbeatAt: new Date(),
      schedule,
      timezone: "Europe/Istanbul",
    },
  });
}
export async function schedulerStatus(now = new Date()) {
  const health = await db.schedulerHealth.findUnique({
    where: { id: "personal" },
  });
  return {
    status: !health
      ? "NOT_STARTED"
      : health.status !== "RUNNING"
        ? health.status
        : now.getTime() - health.lastHeartbeatAt.getTime() > 130_000
          ? "STALE"
          : "RUNNING",
    lastHeartbeatAt: health?.lastHeartbeatAt ?? null,
    lastTickAt: health?.lastTickAt ?? null,
    lastResult: health?.lastResult ?? null,
    schedule: health?.schedule ?? process.env.DAILY_CRON ?? "0 9 * * *",
    timezone: "Europe/Istanbul",
  };
}
