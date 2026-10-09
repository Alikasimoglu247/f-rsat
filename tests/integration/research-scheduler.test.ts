import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db";
import {
  DEFAULT_RESEARCH_CRON,
  RESEARCH_SCHEDULER_ID,
  researchSchedulerStatus,
  startResearchScheduler,
} from "../../src/lib/research/scheduler";

beforeEach(async () => {
  await db.schedulerHealth.deleteMany({
    where: { id: RESEARCH_SCHEDULER_ID },
  });
});
afterAll(() => db.$disconnect());

it("gerçek cron saati bir probu bir kez tetikler ve ayrı araştırma heartbeat'ini durdurur", async () => {
  const run = vi.fn(async () => ({
    id: "synthetic-probe",
    status: "SUCCEEDED",
  }));
  const startedAt = Date.now();
  const personalBefore = await db.schedulerHealth.findUnique({
    where: { id: "personal" },
  });
  const scheduler = await startResearchScheduler({ run, probe: true });
  try {
    const tick = await scheduler.completion;
    expect(tick).toMatchObject({
      trigger: "SCHEDULED_PROBE",
      result: { id: "synthetic-probe", status: "SUCCEEDED" },
      failed: false,
    });
    expect(new Date(tick!.scheduledAt).getTime()).toBeGreaterThanOrEqual(
      Math.floor(startedAt / 1000) * 1000,
    );
    expect(run).toHaveBeenCalledExactlyOnceWith({ trigger: "SCHEDULED_PROBE" });
    expect(await researchSchedulerStatus()).toMatchObject({
      status: "STOPPED",
      lastResult: "SCHEDULED_PROBE:SUCCEEDED",
      nextPlannedRunAt: null,
    });
    expect(
      await db.schedulerHealth.findUnique({ where: { id: "personal" } }),
    ).toEqual(personalBefore);
  } finally {
    await scheduler.stop();
  }
});

it("09.00 yapılandırması, güncel süreç ve bayat heartbeat'i gerçekleşmiş çalışmadan ayırır", async () => {
  expect(await researchSchedulerStatus()).toMatchObject({
    status: "NOT_STARTED",
    lastTickAt: null,
    nextPlannedRunAt: null,
  });
  const run = vi.fn(async () => ({
    id: "synthetic-daily",
    status: "SUCCEEDED",
  }));
  const scheduler = await startResearchScheduler({
    run,
    schedule: DEFAULT_RESEARCH_CRON,
  });
  try {
    const running = await researchSchedulerStatus();
    expect(running).toMatchObject({
      status: "RUNNING",
      schedule: "0 9 * * *",
      timezone: "Europe/Istanbul",
      lastTickAt: null,
    });
    expect(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Istanbul",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(running.nextPlannedRunAt!),
    ).toBe("09:00");
    expect(
      (await researchSchedulerStatus(new Date(Date.now() + 131_000))).status,
    ).toBe("STALE");
    expect(run).not.toHaveBeenCalled();
  } finally {
    await scheduler.stop();
  }
  expect((await researchSchedulerStatus()).status).toBe("STOPPED");
});

it("probda araştırma hatasını başarı saymaz; tick kalıcı ve süreç durmuş olur", async () => {
  const scheduler = await startResearchScheduler({
    probe: true,
    run: async () => {
      throw new Error("Synthetic research failure");
    },
  });
  try {
    expect(await scheduler.completion).toMatchObject({
      failed: true,
      result: null,
      trigger: "SCHEDULED_PROBE",
    });
    expect(await researchSchedulerStatus()).toMatchObject({
      status: "STOPPED",
      lastResult: "SCHEDULED_PROBE:FAILED",
    });
  } finally {
    await scheduler.stop();
  }
});

it("kapanış, başlamış araştırmayı ve sonucunun kaydını bekler", async () => {
  let resolveStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  let resolveJob!: () => void;
  const finishJob = new Promise<void>((resolve) => {
    resolveJob = resolve;
  });
  const scheduler = await startResearchScheduler({
    probe: true,
    run: async () => {
      resolveStarted();
      await finishJob;
      return { id: "synthetic-graceful-stop", status: "SUCCEEDED" };
    },
  });
  try {
    await started;
    const stop = scheduler.stop();
    expect((await researchSchedulerStatus()).status).toBe("RUNNING");
    resolveJob();
    await stop;
    expect(await scheduler.completion).toMatchObject({
      failed: false,
      result: { id: "synthetic-graceful-stop", status: "SUCCEEDED" },
    });
    expect(await researchSchedulerStatus()).toMatchObject({
      status: "STOPPED",
      lastResult: "SCHEDULED_PROBE:SUCCEEDED",
    });
  } finally {
    resolveJob();
    await scheduler.stop();
  }
});
