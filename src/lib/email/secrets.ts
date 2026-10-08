import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  chmod,
  unlink,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const tokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().finite(),
  scope: z.literal(GMAIL_SCOPE),
  accountHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type GmailTokens = z.infer<typeof tokenSchema>;
function key() {
  const value = process.env.GMAIL_TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[A-Za-z0-9_-]{43}=?$/.test(value))
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY 32 bayt base64url olmalı.");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32)
    throw new Error("Gmail şifreleme anahtarı geçersiz.");
  return decoded;
}
export function seal(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function unseal(value: string): unknown {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < 29)
    throw new Error("Gmail güvenli kayıt biçimi geçersiz.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  ) as unknown;
}
const filename = () =>
  resolve(process.env.GMAIL_TOKEN_STORE || ".local/secrets/gmail.enc");
export async function saveTokens(tokens: GmailTokens) {
  const file = filename(),
    directory = dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, seal(tokenSchema.parse(tokens)), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
export async function readTokens() {
  try {
    return tokenSchema.parse(unseal(await readFile(filename(), "utf8")));
  } catch {
    throw new Error(
      "Gmail yetkisi bulunamadı veya güvenli token okunamadı; yeniden bağlanın.",
    );
  }
}
export async function forgetTokens() {
  try {
    await unlink(filename());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
export function gmailConfiguration() {
  const required = [
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REDIRECT_URI",
    "GMAIL_TOKEN_ENCRYPTION_KEY",
  ];
  const missing = required.filter((name) => !process.env[name]);
  let validEncryptionKey = false;
  try {
    key();
    validEncryptionKey = true;
  } catch {
    /* Presence never proves a valid configuration. */
  }
  return {
    configured: missing.length === 0 && validEncryptionKey,
    missing,
    validEncryptionKey,
  };
}
