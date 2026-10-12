import { afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  close: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));
import { sendNotification } from "../../src/lib/notifications";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function configure() {
  vi.stubEnv("SMTP_HOST", "smtp.example.test");
  vi.stubEnv("SMTP_FROM", "from@example.test");
  vi.stubEnv("SMTP_TO", "to@example.test");
  vi.stubEnv("SMTP_USER", "");
  vi.stubEnv("SMTP_PASSWORD", "");
  vi.stubEnv("SMTP_SECURE", "false");
  mocks.createTransport.mockReturnValue({
    sendMail: mocks.sendMail,
    close: mocks.close,
  });
}
it("SMTP kabul cevabı ve TLS zorunluluğu kontrollü testte doğrulanır", async () => {
  configure();
  mocks.sendMail.mockResolvedValue({
    accepted: ["to@example.test"],
    rejected: [],
  });
  await sendNotification("EMAIL", "Sentetik rapor", "test");
  expect(mocks.createTransport).toHaveBeenCalledWith(
    expect.objectContaining({ requireTLS: true }),
  );
  expect(mocks.sendMail).toHaveBeenCalledWith(
    expect.objectContaining({ text: "Sentetik rapor" }),
  );
  expect(mocks.close).toHaveBeenCalledOnce();
});
it("SMTP reddi veya eksik kabul başarı sayılmaz", async () => {
  configure();
  for (const result of [{ accepted: [], rejected: ["to@example.test"] }, {}]) {
    mocks.sendMail.mockResolvedValue(result);
    await expect(
      sendNotification("EMAIL", "test", "test"),
    ).rejects.toMatchObject({ ambiguous: true });
  }
});
it("SMTP kimlik bilgisi yoksa taşıyıcı başlatılmaz", async () => {
  vi.stubEnv("SMTP_HOST", "");
  await expect(sendNotification("EMAIL", "test", "test")).rejects.toThrow(
    "yapılandırılmamış",
  );
  expect(mocks.createTransport).not.toHaveBeenCalled();
});
