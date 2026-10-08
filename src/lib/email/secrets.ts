import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  open,
  lstat,
  rename,
  chmod,
  unlink,
} from "node:fs/promises";
import { dirname, resolve, isAbsolute } from "node:path";
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
export function tokenStorageStatus() {
  const explicitAbsolute =
    !!process.env.GMAIL_TOKEN_STORE &&
    isAbsolute(process.env.GMAIL_TOKEN_STORE);
  const declaredPersistent =
    explicitAbsolute && process.env.GMAIL_TOKEN_STORE_PERSISTENT === "true";
  return {
    explicitAbsolute,
    declaredPersistent,
    requiredForProduction: process.env.NODE_ENV === "production",
    status: declaredPersistent
      ? "DECLARED_PERSISTENT"
      : "PERSISTENCE_UNCONFIRMED",
  };
}
async function rejectSymlink(path: string) {
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error("Güvenli token yolu sembolik bağlantı olamaz.");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
export async function saveTokens(tokens: GmailTokens) {
  const file = filename(),
    directory = dirname(file);
  await rejectSymlink(directory);
  await rejectSymlink(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(seal(tokenSchema.parse(tokens)));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
    const dir = await open(directory, "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
export async function readTokens() {
  try {
    await rejectSymlink(filename());
    await rejectSymlink(dirname(filename()));
    const [file, dir] = await Promise.all([
      lstat(filename()),
      lstat(dirname(filename())),
    ]);
    if (
      !file.isFile() ||
      (file.mode & 0o777) !== 0o600 ||
      (dir.mode & 0o777) !== 0o700
    )
      throw new Error("Güvenli token izinleri geçersiz.");
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
  if (
    process.env.NODE_ENV === "production" &&
    !tokenStorageStatus().declaredPersistent
  )
    missing.push(
      "GMAIL_TOKEN_STORE (mutlak kalıcı yol)",
      "GMAIL_TOKEN_STORE_PERSISTENT",
    );
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
