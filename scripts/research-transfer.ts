import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  exportResearchBundle,
  importResearchBundle,
} from "../src/lib/research/transfer";
const [command, file, flag] = process.argv.slice(2);
if (!file || !["export", "preview", "import"].includes(command))
  throw new Error(
    "Kullanım: npm run research:transfer -- export|preview|import dosya.json [--apply]",
  );
if (command === "export") {
  const bundle = await exportResearchBundle();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(bundle, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      event: "transfer.exported",
      real: bundle.tables.Listing.length,
      prices: bundle.tables.ListingPriceHistory.length,
      runs: bundle.tables.ResearchRun.length,
      sha256: bundle.sha256,
    }),
  );
} else {
  if (command === "import" && flag !== "--apply")
    throw new Error("Önce preview çalıştırın; uygulamak için --apply gerekli.");
  console.log(
    JSON.stringify(
      await importResearchBundle(
        JSON.parse(await readFile(file, "utf8")),
        command === "import",
      ),
    ),
  );
}
