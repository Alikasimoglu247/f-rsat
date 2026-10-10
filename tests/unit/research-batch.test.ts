import { expect, it, vi } from "vitest";
import { runResearchBatch } from "@/lib/research/loop";
it("günlük tetikleme başarısız segmentten sonra diğer segmentleri dener; altı turla sınırlıdır", async () => {
  const run = vi.fn(async () => ({ id: "synthetic-run", status: "COMPLETED" }));
  run.mockResolvedValueOnce({ id: "synthetic-failed", status: "FAILED" });
  const result = await runResearchBatch({ trigger: "SCHEDULED", run });
  expect(run).toHaveBeenCalledTimes(6);
  expect(run).toHaveBeenCalledWith({ trigger: "SCHEDULED" });
  expect(result.status).toBe("PARTIAL");
});
it("bekleme/aktif işte durur; tüm hataları veya hiçbir işi günlük başarı yapmaz", async () => {
  for (const status of ["DEFERRED", "RUNNING", "FAILED"]) {
    const run = vi.fn(async () => ({ id: "synthetic-run", status }));
    expect((await runResearchBatch({ trigger: "SCHEDULED", run })).status).toBe(
      status,
    );
    expect(run).toHaveBeenCalledTimes(status === "FAILED" ? 6 : 1);
  }
  const stopped = vi.fn(async () => ({
    id: "synthetic-deferred",
    status: "DEFERRED",
  }));
  stopped.mockResolvedValueOnce({ id: "synthetic-failed", status: "FAILED" });
  expect(
    (await runResearchBatch({ trigger: "SCHEDULED", run: stopped })).status,
  ).toBe("FAILED");
  expect(stopped).toHaveBeenCalledTimes(2);
});
