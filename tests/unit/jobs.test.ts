import { it, expect, vi } from "vitest";
import { retry, localDay } from "../../src/lib/jobs";
it("takvim gününü İstanbul saat diliminde belirler", () =>
  expect(localDay(new Date("2026-10-07T22:30:00Z"))).toBe("2026-10-08"));
it("geçici hatadan sonra sınırlı tekrar yapar", async () => {
  const operation = vi
    .fn()
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce("ok");
  const pause = vi.fn().mockResolvedValue(undefined);
  expect(await retry(operation, 3, pause)).toBe("ok");
  expect(operation).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledWith(250);
});
it("kalıcı hatayı üç denemeden sonra bildirir", async () => {
  const operation = vi.fn().mockRejectedValue(new Error("denied"));
  await expect(retry(operation, 3, async () => {})).rejects.toThrow("denied");
  expect(operation).toHaveBeenCalledTimes(3);
});
