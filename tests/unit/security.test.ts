import { afterEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";
import { readJson } from "../../src/lib/http";
import { money } from "../../src/lib/constants";
afterEach(() => vi.unstubAllEnvs());
it("yapılandırılmış erişim anahtarı yoksa yerel kullanıma izin verir", () => {
  vi.stubEnv("APP_ACCESS_TOKEN", "");
  expect(proxy(new NextRequest("http://127.0.0.1:3000/")).status).toBe(200);
});
it("yapılandırılmış HTTP Basic anahtarını sabit zaman karşılaştırmasıyla kontrol eder", () => {
  vi.stubEnv("APP_ACCESS_TOKEN", "test-only-local");
  expect(proxy(new NextRequest("http://127.0.0.1:3000/")).status).toBe(401);
  const auth = (password: string) =>
    new NextRequest("http://127.0.0.1:3000/", {
      headers: {
        Authorization: `Basic ${Buffer.from(`radar:${password}`).toString("base64")}`,
      },
    });
  expect(proxy(auth("wrong")).status).toBe(401);
  expect(proxy(auth("test-only-local")).status).toBe(200);
});
it("origin kontrolü yapılandırılmış URL üzerinden çalışır", async () => {
  vi.stubEnv("APP_BASE_URL", "http://127.0.0.1:3000");
  const request = (origin: string) =>
    new Request("http://localhost:3000/api/settings", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: "{}",
    });
  expect(await readJson(request("http://127.0.0.1:3000"))).toEqual({});
  await expect(readJson(request("https://example.net"))).rejects.toThrow(
    "Farklı origin",
  );
});
it("büyük parasal değerleri ve kuruşları gösterirken float kullanmaz", () =>
  expect(money("9999999999999999.25")).toBe("₺9.999.999.999.999.999,25"));
