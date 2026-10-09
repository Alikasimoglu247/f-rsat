import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { db } from "../db";

export const RESEARCH_SCHEDULER_ID = "investment-research";
export const RESEARCH_TIMEZONE = "Europe/Istanbul";
export const DEFAULT_RESEARCH_CRON = "0 9 * * *";
const PROBE_CRON = "* * * * * *";
const HEARTBEAT_MS = 60_000;
const STALE_AFTER_MS = 130_000;

export type ResearchTick = {
  trigger: "SCHEDULED" | "SCHEDULED_PROBE";
  scheduledAt: string;
  result: { id: string; status: string } | null;
  failed: boolean;
};
type ResearchJob = (options: {
  trigger: ResearchTick["trigger"];
}) => Promise<{ id: string; status: string }>;
type SchedulerEvent = {
  event: string;
  instanceId: string;
  schedule?: string;
  timezone?: string;
  nextRunAt?: string | null;
  tick?: ResearchTick;
};

function configuredSchedule() {
  return process.env.INVESTMENT_RESEARCH_CRON ?? DEFAULT_RESEARCH_CRON;
}

/** A prospective date is not evidence that a process or research run executed. */
function plannedDate(schedule: string): Date | null {
  if (!cron.validate(schedule)) return null;
  const task = cron.createTask(schedule, () => undefined, {
    timezone: RESEARCH_TIMEZONE,
  });
  const next = task.getNextRuns(1)[0] ?? null;
  void task.destroy();
  return next;
}

export async function researchSchedulerStatus(now = new Date()) {
  const health = await db.schedulerHealth.findUnique({
    where: { id: RESEARCH_SCHEDULER_ID },
  });
  const status = !health
    ? "NOT_STARTED"
    : health.status !== "RUNNING"
      ? health.status
      : now.getTime() - health.lastHeartbeatAt.getTime() > STALE_AFTER_MS
        ? "STALE"
        : "RUNNING";
  const schedule = health?.schedule ?? configuredSchedule();
  return {
    status,
    lastHeartbeatAt: health?.lastHeartbeatAt ?? null,
    lastTickAt: health?.lastTickAt ?? null,
    lastResult: health?.lastResult ?? null,
    schedule,
    timezone: RESEARCH_TIMEZONE,
    // A healthy heartbeat plus this future date still does not prove a 09:00 run.
    nextPlannedRunAt: status === "RUNNING" ? plannedDate(schedule) : null,
  };
}

/** Independent research scheduler: no mailbox reads or report deliveries. */
export async function startResearchScheduler(options: {
  run: ResearchJob;
  probe?: boolean;
  schedule?: string;
  onEvent?: (event: SchedulerEvent) => void;
}) {
  const probe = options.probe ?? false;
  const schedule = probe
    ? PROBE_CRON
    : (options.schedule ?? configuredSchedule());
  if (!cron.validate(schedule))
    throw new Error("INVESTMENT_RESEARCH_CRON geçersiz.");
  const instanceId = randomUUID();
  const trigger = probe ? "SCHEDULED_PROBE" : "SCHEDULED";
  const emit = (event: Omit<SchedulerEvent, "instanceId">) =>
    options.onEvent?.({ ...event, instanceId });
  await db.schedulerHealth.upsert({
    where: { id: RESEARCH_SCHEDULER_ID },
    create: {
      id: RESEARCH_SCHEDULER_ID,
      instanceId,
      status: "RUNNING",
      lastHeartbeatAt: new Date(),
      schedule,
      timezone: RESEARCH_TIMEZONE,
    },
    update: {
      instanceId,
      status: "RUNNING",
      lastHeartbeatAt: new Date(),
      schedule,
      timezone: RESEARCH_TIMEZONE,
    },
  });
  let resolveCompletion!: (tick: ResearchTick | null) => void;
  const completion = new Promise<ResearchTick | null>((resolve) => {
    resolveCompletion = resolve;
  });
  let stopped = false;
  let fired = false;
  let inFlight: Promise<ResearchTick> | null = null;
  let stopPromise: Promise<void> | null = null;
  const heartbeat = setInterval(() => {
    void db.schedulerHealth
      .updateMany({
        where: { id: RESEARCH_SCHEDULER_ID, instanceId },
        data: { lastHeartbeatAt: new Date() },
      })
      .catch(() => emit({ event: "research.scheduler.heartbeat.failed" }));
  }, HEARTBEAT_MS);

  const finalize = async (tick: ResearchTick | null) => {
    clearInterval(heartbeat);
    await db.schedulerHealth
      .updateMany({
        where: { id: RESEARCH_SCHEDULER_ID, instanceId },
        data: { status: "STOPPED", lastHeartbeatAt: new Date() },
      })
      .catch(() => emit({ event: "research.scheduler.stop.failed" }));
    await task.destroy();
    resolveCompletion(tick);
    emit({ event: "research.scheduler.stopped" });
  };

  const task = cron.schedule(
    schedule,
    async (context) => {
      if (stopped || (probe && fired)) return;
      fired = true;
      const tick: ResearchTick = {
        trigger,
        scheduledAt: context.date.toISOString(),
        result: null,
        failed: false,
      };
      inFlight = (async () => {
        if (probe) await task.stop();
        try {
          tick.result = await options.run({ trigger });
          tick.failed = tick.result.status === "FAILED";
        } catch {
          tick.failed = true;
        }
        await db.schedulerHealth
          .updateMany({
            where: { id: RESEARCH_SCHEDULER_ID, instanceId },
            data: {
              lastTickAt: new Date(),
              lastHeartbeatAt: new Date(),
              lastResult: `${trigger}:${tick.failed ? "FAILED" : tick.result!.status}`,
            },
          })
          .catch(() =>
            emit({ event: "research.scheduler.tick.persist.failed" }),
          );
        emit({ event: "research.scheduler.tick", tick });
        return tick;
      })();
      await inFlight;
      inFlight = null;
      if (probe && !stopped) {
        stopped = true;
        await finalize(tick);
      }
    },
    { timezone: RESEARCH_TIMEZONE, noOverlap: true },
  );
  emit({
    event: "research.scheduler.started",
    schedule,
    timezone: RESEARCH_TIMEZONE,
    nextRunAt: task.getNextRun()?.toISOString() ?? null,
  });
  return {
    instanceId,
    completion,
    nextRun: () => task.getNextRun(),
    stop: () => {
      stopPromise ??= (async () => {
        if (stopped) return;
        stopped = true;
        clearInterval(heartbeat);
        await task.stop();
        const tick = inFlight ? await inFlight : null;
        await finalize(tick);
      })();
      return stopPromise;
    },
  };
}
