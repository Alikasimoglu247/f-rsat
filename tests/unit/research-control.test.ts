import { afterEach, expect, it, vi } from "vitest";
import { requireLocalControl } from "../../src/lib/research/control";
afterEach(() => vi.unstubAllEnvs());
const req = (origin?: string, authorization?: string) =>
  new Request("http://127.0.0.1:3000/api/research/start", {
    method: "POST",
    headers: {
      ...(origin ? { origin } : {}),
      ...(authorization ? { authorization } : {}),
    },
  });
it("origin zorunludur ve farklı origin reddedilir", () => {
  vi.stubEnv("APP_BASE_URL", "http://127.0.0.1:3000");
  vi.stubEnv("APP_ACCESS_TOKEN", "");
  expect(() => requireLocalControl(req())).toThrow("kendi sayfasından");
  expect(() => requireLocalControl(req("https://evil.example"))).toThrow();
  expect(() => requireLocalControl(req("http://127.0.0.1:3000"))).not.toThrow();
});
it("yerel olmayan erişim doğrulanmış anahtar gerektirir", () => {
  vi.stubEnv("APP_BASE_URL", "https://radar.example");
  vi.stubEnv("APP_ACCESS_TOKEN", "");
  expect(() => requireLocalControl(req("https://radar.example"))).toThrow(
    "erişim denetimi",
  );
  vi.stubEnv("APP_ACCESS_TOKEN", "test-only");
  expect(() => requireLocalControl(req("https://radar.example"))).toThrow(
    "Kimlik",
  );
  expect(() =>
    requireLocalControl(
      req(
        "https://radar.example",
        `Basic ${Buffer.from("radar:test-only").toString("base64")}`,
      ),
    ),
  ).not.toThrow();
});
