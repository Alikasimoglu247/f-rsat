import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";

// Linux Docker acceptance of the actual Windows Compose service graph. This is
// not a Windows 11 / PowerShell GUI test. Only this generated test volume is removed.
const image = process.argv[2] ?? "firsatradar:ci";
if (!/^[a-z0-9][a-z0-9/:._-]*$/i.test(image)) throw new Error("Invalid image");
const project = `firsatradar-v2-smoke-${randomUUID()}`;
const dir = resolve(".local", project);
await mkdir(dir, { recursive: true, mode: 0o700 });
const socket = createServer();
await new Promise((done) => socket.listen(0, "127.0.0.1", done));
const port = socket.address().port;
await new Promise((done) => socket.close(done));
const password = randomBytes(24).toString("hex"),
  access = randomBytes(24).toString("hex");
const envFile = resolve(dir, "runtime.env"),
  composeFile = resolve(dir, "compose.yaml");
await writeFile(
  envFile,
  [
    "POSTGRES_USER=smoke",
    `POSTGRES_PASSWORD=${password}`,
    "POSTGRES_DB=smoke",
    `DATABASE_URL=postgresql://smoke:${password}@postgres:5432/smoke`,
    `APP_BASE_URL=http://127.0.0.1:${port}`,
    `APP_ACCESS_TOKEN=${access}`,
    "INVESTMENT_RESEARCH_CRON=0 0 1 1 *",
    "AI_ENABLED=false",
  ].join("\n"),
  { mode: 0o600 },
);
const original = await readFile("compose.windows.yaml", "utf8");
const spec = original
  .replaceAll(
    "env_file: .env.windows.local",
    `env_file: ${JSON.stringify(envFile)}`,
  )
  .replace("build: .", `build: ${JSON.stringify(resolve("."))}`)
  .replaceAll("image: firsatradar:windows-local", `image: ${image}`)
  .replace('"127.0.0.1:3000:3000"', `"127.0.0.1:${port}:3000"`);
await writeFile(composeFile, spec, { mode: 0o600 });
const compose = [
  "compose",
  "--project-name",
  project,
  "--env-file",
  envFile,
  "-f",
  composeFile,
];
function docker(args, quiet = false) {
  const r = spawnSync("docker", args, {
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (r.status !== 0)
    throw new Error(
      "Compose acceptance failed; no production volume was used.",
    );
  return r.stdout;
}
async function api(path, body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      // A web-container restart invalidates its pooled TCP sockets. Open a
      // connection for each acceptance request rather than reuse the old one.
      Connection: "close",
      Authorization: `Basic ${Buffer.from(`radar:${access}`).toString("base64")}`,
      ...(body !== undefined
        ? {
            "Content-Type": "application/json",
            Origin: `http://127.0.0.1:${port}`,
          }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      `Smoke API failed (${response.status}); response/credentials not logged.`,
    );
  return response.json();
}
try {
  docker([...compose, "config", "--quiet"], true);
  docker([
    ...compose,
    "up",
    "-d",
    "--no-build",
    "--wait",
    "--wait-timeout",
    "240",
  ]);
  const health = await api("health"),
    initial = await api("product");
  if (
    health.database !== "connected" ||
    initial.counts.real !== 0 ||
    initial.counts.demo !== 0 ||
    initial.investment.researchLoop.scheduler.status !== "RUNNING"
  )
    throw new Error("Fresh empty runtime / worker heartbeat mismatch");
  const unauthenticated = await fetch(`http://127.0.0.1:${port}/api/health`, {
    headers: { Connection: "close" },
    signal: AbortSignal.timeout(15_000),
  });
  if (unauthenticated.status !== 401) throw new Error("Access control missing");
  await api("settings"); // no seed is required to open first-run settings
  const created = await api("listings", {
    title: "[DEMO] SYNTHETIC Compose persistence check",
    category: "ARSA",
    province: "İstanbul",
    district: "Silivri",
    price: "440000",
    externalId: "compose-smoke-only",
    isDemo: true,
  });
  if (created.inserted !== 1) throw new Error("Fixture not stored");
  const before = await api("product");
  const volumeBefore = docker(
    [...compose, "ps", "-q", "postgres"],
    true,
  ).trim();
  docker([
    ...compose,
    "up",
    "-d",
    "--no-build",
    "--force-recreate",
    "--no-deps",
    "--wait",
    "--wait-timeout",
    "240",
    "web",
    "research",
  ]);
  const after = await api("product");
  if (
    after.counts.real !== 0 ||
    after.counts.demo !== 1 ||
    before.counts.demo !== 1 ||
    after.investment.researchLoop.scheduler.status !== "RUNNING"
  )
    throw new Error("Records or worker lost on web/worker update");
  if (
    docker([...compose, "ps", "-q", "postgres"], true).trim() !== volumeBefore
  )
    throw new Error("Postgres recreated during app update");
  console.log(
    "Windows Compose on Linux: fresh empty DB, authenticated health, real worker heartbeat, no demo seed, first-run settings and persistence after web/worker recreation passed. Windows GUI not tested.",
  );
} finally {
  if (!/^firsatradar-v2-smoke-[a-f0-9-]+$/.test(project))
    throw new Error("Cleanup guard");
  try {
    docker([...compose, "down", "--volumes", "--remove-orphans"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
