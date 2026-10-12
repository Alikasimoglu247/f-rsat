import "dotenv/config";
import { db } from "../src/lib/db";
import { ensureSources } from "../src/lib/providers/registry";
import { ensurePilotProfiles } from "../src/lib/pilots";
try {
  await ensureSources(db);
  await ensurePilotProfiles(db);
  console.info(
    JSON.stringify({ event: "bootstrap.completed", demoSeeded: false }),
  );
} finally {
  await db.$disconnect();
}
