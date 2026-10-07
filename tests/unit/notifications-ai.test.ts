import { afterEach, it, expect, vi } from "vitest";
import {
  sendNotification,
  DeliveryError,
  notificationBody,
} from "../../src/lib/notifications";
import { optionalAiExplanation } from "../../src/lib/ai";
import type { ListingView } from "../../src/lib/listings";
const listing = {
  id: "test",
  title: "Örnek ilan",
  price: "1000000.00",
  isDemo: true,
  sourceUrl: "https://example.com/42",
  assessment: {
    medianPrice: "1200000.00",
    rangeLow: "1100000.00",
    rangeHigh: "1300000.00",
    score: 74,
    confidence: "MEDIUM",
    riskFlags: [
      { code: "LEGAL", label: "Tapu durumu doğrulanmamış.", verified: false },
    ],
    explanation: "5 benzer ilanın istenen fiyatları karşılaştırıldı.",
  },
} as ListingView;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("bildirim fiyat, aralık, risk, puan, URL ve demo etiketi içerir", () => {
  const body = notificationBody(listing);
  for (const text of [
    "[DEMO]",
    "1.000.000",
    "1.100.000",
    "1.300.000",
    "74",
    "MEDIUM",
    "Tapu durumu doğrulanmamış.",
    "https://example.com/42",
  ])
    expect(body).toContain(text);
});
it("Telegram kimlik bilgisi yoksa hiçbir ağ çağrısı yapmaz", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
  vi.stubEnv("TELEGRAM_CHAT_ID", "");
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  await expect(sendNotification("TELEGRAM", "body", "title")).rejects.toThrow(
    "yapılandırılmamış",
  );
  expect(request).not.toHaveBeenCalled();
});
it("Telegram protokolünü test double üzerinde doğrular", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-placeholder");
  vi.stubEnv("TELEGRAM_CHAT_ID", "test-chat");
  const request = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
  vi.stubGlobal("fetch", request);
  await sendNotification("TELEGRAM", "hello", "title");
  expect(request.mock.calls[0][1].method).toBe("POST");
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
    chat_id: "test-chat",
    text: "hello",
  });
});
it("belirsiz ağ hatasını tekrar teslimat riskine göre ayırır", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-placeholder");
  vi.stubEnv("TELEGRAM_CHAT_ID", "test-chat");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
  try {
    await sendNotification("TELEGRAM", "hello", "title");
    throw new Error("Expected failure");
  } catch (error) {
    expect(error).toBeInstanceOf(DeliveryError);
    expect((error as DeliveryError).ambiguous).toBe(true);
  }
});
it("AI kapalıyken deterministik kanıt açıklamasını döndürür", async () => {
  vi.stubEnv("AI_ENABLED", "false");
  expect(await optionalAiExplanation(listing)).toMatchObject({
    enabled: false,
    text: listing.assessment!.explanation,
  });
});
it("AI yalnızca var olan kanıt cümlelerini seçebilir", async () => {
  vi.stubEnv("AI_ENABLED", "true");
  vi.stubEnv("AI_API_KEY", "test-placeholder");
  vi.stubEnv("AI_MODEL", "test-model");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify({ factIds: [1] }) } },
            ],
          }),
          { status: 200 },
        ),
      ),
  );
  const result = await optionalAiExplanation(listing);
  expect(result.text).toBe(
    `${listing.assessment!.explanation} Tapu durumu doğrulanmamış.`,
  );
});
it("AI uydurma kanıt kimliği döndürürse reddeder", async () => {
  vi.stubEnv("AI_ENABLED", "true");
  vi.stubEnv("AI_API_KEY", "test-placeholder");
  vi.stubEnv("AI_MODEL", "test-model");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify({ factIds: [999] }) } },
            ],
          }),
          { status: 200 },
        ),
      ),
  );
  await expect(optionalAiExplanation(listing)).rejects.toThrow();
});
