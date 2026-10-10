import { Client } from "pg";
export class ResearchWorkerAlreadyRunningError extends Error {}

/** A dedicated PostgreSQL session owns the worker lock until graceful stop or process death. */
export async function claimResearchWorker() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const result = await client.query<{ claimed: boolean }>(
      "SELECT pg_try_advisory_lock(451813) AS claimed",
    );
    if (!result.rows[0]?.claimed)
      throw new ResearchWorkerAlreadyRunningError(
        "Başka bir araştırma worker'ı çalışıyor; ikinci süreç başlatılmadı.",
      );
  } catch (error) {
    await client.end();
    throw error;
  }
  let closed = false;
  return {
    onLost: (handler: () => void) => client.on("error", handler),
    close: async () => {
      if (closed) return;
      closed = true;
      try {
        await client.query("SELECT pg_advisory_unlock(451813)");
      } finally {
        await client.end();
      }
    },
  };
}
