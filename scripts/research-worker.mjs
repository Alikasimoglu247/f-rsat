import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const script = fileURLToPath(import.meta.url);
const root = path.dirname(path.dirname(script));
const directory = path.join(root, ".local/research-worker");
const lockPath = path.join(directory, "supervisor.json");
const logPath = path.join(directory, "events.jsonl");
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const read = () => {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
};
function owned(state) {
  if (!state?.pid || !state?.nonce || process.platform !== "linux")
    return false;
  try {
    const args = fs
      .readFileSync(`/proc/${state.pid}/cmdline`, "utf8")
      .split("\0");
    return args.includes(script) && args.includes(state.nonce);
  } catch {
    return false;
  }
}
const emit = (event, fields = {}) =>
  fs.appendFileSync(
    logPath,
    JSON.stringify({ at: new Date().toISOString(), event, ...fields }) + "\n",
    { mode: 0o600 },
  );
const [command = "status", nonce] = process.argv.slice(2);
if (process.platform !== "linux")
  throw new Error(
    "Bu yerel süreç kontrolü Linux içindir; Windows'ta işletim sistemi hizmet yöneticisini kullanın.",
  );
if (command === "status") {
  const state = read();
  console.log(
    JSON.stringify({
      running: owned(state),
      supervisorPid: owned(state) ? state.pid : null,
      logPath,
      note: "Süreç durumu araştırma veya 24/7 çalışma başarısı değildir.",
    }),
  );
} else if (command === "stop" || command === "restart") {
  const state = read();
  if (owned(state)) {
    process.kill(state.pid, "SIGTERM");
    const deadline = Date.now() + 65_000;
    while (owned(state) && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 200));
    if (owned(state))
      throw new Error("Süreç henüz kapanmadı; ikinci süreç başlatılmadı.");
  }
  if (command === "restart") {
    const child = spawn(process.execPath, [script, "start"], {
      cwd: root,
      stdio: "inherit",
    });
    process.exitCode = await new Promise((resolve) =>
      child.once("exit", (code) => resolve(code ?? 1)),
    );
  } else console.log("Araştırma supervisor'ı durduruldu; kayıtlar korundu.");
} else if (command === "start") {
  const current = read();
  if (owned(current))
    throw new Error("Araştırma supervisor'ı zaten çalışıyor.");
  if (
    current &&
    !current.pid &&
    Date.now() - Date.parse(current.createdAt) < 5000
  )
    throw new Error("Başlangıç devam ediyor; ikinci süreç başlatılmadı.");
  if (current) fs.unlinkSync(lockPath);
  const ticket = {
    pid: null,
    nonce: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(lockPath, JSON.stringify(ticket), {
    flag: "wx",
    mode: 0o600,
  });
  const log = fs.openSync(logPath, "a", 0o600);
  try {
    const child = spawn(process.execPath, [script, "--run", ticket.nonce], {
      cwd: root,
      detached: true,
      stdio: ["ignore", log, log],
    });
    child.unref();
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!owned(read()))
      throw new Error("Supervisor başlamadı; olay kaydını inceleyin.");
    console.log(
      JSON.stringify({
        started: true,
        supervisorPid: read().pid,
        logPath,
        note: "Cloud ortamının kapanmasına karşı kalıcılık garantisi yoktur.",
      }),
    );
  } finally {
    fs.closeSync(log);
  }
} else if (command === "--run") {
  const ticket = read();
  if (ticket?.nonce !== nonce)
    throw new Error("Supervisor sahipliği doğrulanamadı.");
  fs.writeFileSync(lockPath, JSON.stringify({ ...ticket, pid: process.pid }));
  let stopping = false,
    child = null,
    restarts = 0;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    emit("supervisor.stopping");
    child?.kill("SIGTERM");
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  emit("supervisor.started", { pid: process.pid });
  try {
    while (!stopping) {
      child = spawn(
        process.execPath,
        ["--import", "tsx", "scripts/research-scheduler.ts"],
        { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
      );
      const ownedChild = child;
      let timer;
      const watchdog = setInterval(() => {
        if (stopping && !timer)
          timer = setTimeout(() => ownedChild.kill("SIGKILL"), 60_000);
      }, 200);
      emit("worker.started", { pid: child.pid, restart: restarts });
      const result = await new Promise((resolve) => {
        child.once("error", () => resolve({ code: 1, signal: null }));
        child.once("exit", (code, signal) => resolve({ code, signal }));
      });
      clearInterval(watchdog);
      clearTimeout(timer);
      emit("worker.exited", result);
      child = null;
      if (stopping || result.code === 73) break;
      if (++restarts > 5) {
        emit("supervisor.restart.limit");
        break;
      }
      const until = Date.now() + Math.min(60_000, 1000 * 2 ** restarts);
      while (!stopping && Date.now() < until)
        await new Promise((r) => setTimeout(r, 200));
    }
  } finally {
    if (read()?.nonce === nonce) fs.unlinkSync(lockPath);
    emit("supervisor.stopped");
  }
} else
  throw new Error(
    "Kullanım: node scripts/research-worker.mjs start|stop|restart|status",
  );
