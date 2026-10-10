import { afterEach, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, stat, mkdtemp, rm, chmod, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  seal,
  unseal,
  saveTokens,
  readTokens,
  gmailConfiguration,
  GMAIL_SCOPE,
} from "../../src/lib/email/secrets";
import {
  mailboxSelectionSchema,
  selectionMatches,
  gmailQuery,
} from "../../src/lib/email/gmail";
afterEach(() => vi.unstubAllEnvs());
it("AES-GCM tokenları şifreler; değiştirilmiş içerik ve yanlış anahtar açılmaz", () => {
  vi.stubEnv(
    "GMAIL_TOKEN_ENCRYPTION_KEY",
    randomBytes(32).toString("base64url"),
  );
  const encrypted = seal({ refreshToken: "test-secret-not-live" });
  expect(encrypted).not.toContain("test-secret");
  expect(unseal(encrypted)).toEqual({ refreshToken: "test-secret-not-live" });
  const bytes = Buffer.from(encrypted, "base64url");
  bytes[bytes.length - 1] ^= 1;
  expect(() => unseal(bytes.toString("base64url"))).toThrow();
  vi.stubEnv(
    "GMAIL_TOKEN_ENCRYPTION_KEY",
    randomBytes(32).toString("base64url"),
  );
  expect(() => unseal(encrypted)).toThrow();
});
it("token dosyası yalnızca şifreli, dosya 0600 ve dizin 0700 izinleriyle saklanır", async () => {
  const dir = await mkdtemp(join(tmpdir(), "radar-gmail-unit-")),
    file = join(dir, "secrets", "gmail.enc");
  vi.stubEnv(
    "GMAIL_TOKEN_ENCRYPTION_KEY",
    randomBytes(32).toString("base64url"),
  );
  vi.stubEnv("GMAIL_TOKEN_STORE", file);
  try {
    const token = {
      accessToken: "test-access",
      refreshToken: "test-refresh",
      expiresAt: Date.now() + 3600_000,
      scope: GMAIL_SCOPE,
      accountHash: "a".repeat(64),
    } satisfies Parameters<typeof saveTokens>[0];
    await saveTokens(token);
    expect(await readTokens()).toEqual(token);
    const restarted = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        "import {readTokens} from './src/lib/email/secrets.ts'; const t=await readTokens(); process.exit(t.refreshToken==='test-refresh' ? 0 : 1)",
      ],
      { env: process.env, stdio: "pipe" },
    );
    expect(restarted.status).toBe(0);
    expect(await readFile(file, "utf8")).not.toContain("test-refresh");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, "secrets"))).mode & 0o777).toBe(0o700);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("eksik yapılandırmayı ve yanlış anahtarı bağlı kabul etmez; değerleri dışarı vermez", () => {
  for (const name of [
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REDIRECT_URI",
    "GMAIL_TOKEN_ENCRYPTION_KEY",
  ])
    vi.stubEnv(name, "");
  expect(gmailConfiguration().configured).toBe(false);
  vi.stubEnv("GMAIL_CLIENT_SECRET", "do-not-expose");
  expect(JSON.stringify(gmailConfiguration())).not.toContain("do-not-expose");
});
it("seçim zorunludur; sorgu enjeksiyonu ve rastgele label ID kabul edilmez", () => {
  expect(
    mailboxSelectionSchema.safeParse({ labelIds: [], senders: [] }).success,
  ).toBe(false);
  expect(
    mailboxSelectionSchema.safeParse({
      labelIds: [],
      senders: ["foo@example.com OR in:anywhere"],
    }).success,
  ).toBe(false);
  expect(
    mailboxSelectionSchema.safeParse({
      labelIds: ["INBOX&format=raw"],
      senders: [],
    }).success,
  ).toBe(false);
  expect(
    mailboxSelectionSchema.safeParse({ labelIds: ["Label_123"], senders: [] })
      .success,
  ).toBe(true);
});
it("metadata ve raw mesajlar seçili label/gönderici sınırında olmalı", () => {
  const selection = {
    labelIds: ["Label_123"],
    senders: ["notifications@example.com"],
  };
  expect(
    selectionMatches(["Label_123"], "notifications@example.com", selection),
  ).toBe(true);
  expect(
    selectionMatches(["INBOX"], "notifications@example.com", selection),
  ).toBe(false);
  expect(selectionMatches(["Label_123"], "other@example.com", selection)).toBe(
    false,
  );
  expect(
    selectionMatches(["INBOX"], "anything@example.com", {
      labelIds: [],
      senders: [],
    }),
  ).toBe(false);
  expect(
    gmailQuery(selection, new Date("2026-01-01"), new Date("2026-01-02")),
  ).toContain(
    "(from:notifications@example.com) after:1767225600 before:1767312000",
  );
});

it("üretim OAuth kalıcı mutlak token yolu gerektirir", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("GMAIL_TOKEN_STORE", "relative.enc");
  vi.stubEnv("GMAIL_TOKEN_STORE_PERSISTENT", "true");
  expect(gmailConfiguration().configured).toBe(false);
  expect(gmailConfiguration().missing).toContain(
    "GMAIL_TOKEN_STORE_PERSISTENT",
  );
});
it("token deposu geniş dosya izinlerini ve sembolik bağlantıları reddeder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "radar-token-guards-"));
  vi.stubEnv(
    "GMAIL_TOKEN_ENCRYPTION_KEY",
    randomBytes(32).toString("base64url"),
  );
  const file = join(dir, "secrets", "gmail.enc");
  vi.stubEnv("GMAIL_TOKEN_STORE", file);
  try {
    await saveTokens({
      accessToken: "synthetic",
      refreshToken: "synthetic",
      scope: GMAIL_SCOPE,
      accountHash: "a".repeat(64),
      expiresAt: Date.now() + 3600000,
    });
    await chmod(file, 0o644);
    await expect(readTokens()).rejects.toThrow("güvenli token");
    await chmod(file, 0o600);
    const link = join(dir, "link.enc");
    await symlink(file, link);
    vi.stubEnv("GMAIL_TOKEN_STORE", link);
    await expect(readTokens()).rejects.toThrow();
    await expect(
      saveTokens({
        accessToken: "test",
        refreshToken: "test",
        scope: GMAIL_SCOPE,
        accountHash: "a".repeat(64),
        expiresAt: Date.now(),
      }),
    ).rejects.toThrow("sembolik");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
