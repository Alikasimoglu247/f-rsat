import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { stableJson } from "./store";
import { canonicalUrl } from "../listings";
import { HttpError } from "../http";

// This is a public research transfer, never a database dump. Mail, settings,
// credentials, contact details, photographs and demo data are not transferable.
const columns = {
  ListingSource:
    "id name method authorization accessStatus lastSuccessAt lastError freshnessHours categories regions lastNewCount",
  Listing:
    "id title category province district neighborhood transactionType price sourceUrl externalId identityKey identityVersion identityStatus sourceId isDemo provenance collectedAt lastObservedAt createdAt updatedAt publishedAt sourceUpdatedAt pageCheckedAt priceVerifiedAt priceVerification availabilityStatus availabilityVerifiedAt verificationEvidence",
  PropertyDetails:
    "listingId sizeM2 netM2 grossM2 propertyType rooms buildingAge condition legalStatus earthquakeInfo",
  VehicleDetails:
    "listingId make model trim modelYear mileage fuel transmission damageHistory bodyType bodyTypeVerified bodyTypeEvidence",
  LandDetails:
    "listingId sizeM2 classification zoning roadAccess parcelNumber sharedOwnership agriculturalRestrictions",
  ListingPriceHistory: "id listingId price observedAt provenance",
  OpportunityAssessment:
    "id listingId medianPrice rangeLow rangeHigh relativeDifference priceChange sampleCount confidence score riskFlags explanation assessedAt",
  ListingReview:
    "id sourceId kind status reason dedupKey input candidateIds createdAt resolvedAt",
  SearchProfile:
    "id name category province district minPrice maxPrice pilotKey categories provinces bodyTypes fuels transactionType trackPriceDrops createdAt",
  ResearchResource:
    "url host kind policyStatus state discoveredFrom discoveredAt lastCheckedAt lastSuccessAt sha256 lastReason",
  ResearchRun:
    "id trigger segment status previousId startedAt completedAt summary snapshot decisions changes checks discoveries",
} as const;
type Table = keyof typeof columns;
type Row = Record<string, unknown>;
export type ResearchBundle = {
  format: "firsatradar-public-research";
  version: 1 | 2;
  exportedAt: string;
  tables: Record<Table, Row[]>;
  sha256: string;
};
const iso = z.iso.datetime({ offset: true });
const privateKey =
  /password|secret|token|authorizationHeader|cookie|email|sender|recipient|phone|contact|photo|image|rawHtml|bodyHtml|bodyText/i;
const privateText =
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+90[\s()-]*|\b0[\s()-]*)5\d{2}[\s()-]*\d{3}[\s()-]*\d{2}[\s()-]*\d{2}\b/g;
const secretText =
  /postgres(?:ql)?:\/\/[^\s"'<>]+|Bearer\s+[\w.+/=-]+|(?:password|secret|access[_ -]?token|api[_ -]?key)\s*[:=]\s*["']?[\w.+/=-]{8,}/gi;
function publicJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicJson);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !privateKey.test(key))
        .map(([key, v]) => [key, publicJson(v)]),
    );
  return typeof value === "string"
    ? value
        .replace(privateText, "[kişisel bilgi çıkarıldı]")
        .replace(secretText, "[gizli bilgi çıkarıldı]")
    : value;
}
function digest(bundle: Omit<ResearchBundle, "sha256">) {
  return createHash("sha256").update(stableJson(bundle)).digest("hex");
}
function clean(row: Row, table: Table) {
  const result: Row = {};
  for (const key of columns[table].split(" ")) {
    if (!(key in row)) continue;
    // The authorization column contains the public usage policy, not an auth token.
    result[key] = publicJson(row[key]);
  }
  return result;
}
const quoted = (table: Table) =>
  columns[table]
    .split(" ")
    .map((key) => `"${key}"`)
    .join(", ");
const projection = (table: Table) =>
  columns[table]
    .split(" ")
    .map((key) =>
      key === "categories" ? `to_json("${key}") AS "${key}"` : `"${key}"`,
    )
    .join(", ");

export function validateBundle(value: unknown): ResearchBundle {
  const envelope = z
    .object({
      format: z.literal("firsatradar-public-research"),
      version: z.union([z.literal(1), z.literal(2)]),
      exportedAt: iso,
      tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict()
    .parse(value);
  if (
    Object.keys(envelope.tables).sort().join() !==
    Object.keys(columns).sort().join()
  )
    throw new HttpError(400, "Paket tabloları şema sürümüyle uyuşmuyor.");
  const bundle = envelope as ResearchBundle;
  const { sha256, ...payload } = bundle;
  if (digest(payload) !== sha256)
    throw new HttpError(400, "Paket bütünlük kontrolü başarısız.");
  if (stableJson(publicJson(bundle.tables)) !== stableJson(bundle.tables))
    throw new HttpError(400, "Pakette özel veya kişisel bilgiler var.");
  const sources = new Set(bundle.tables.ListingSource.map((row) => row.id));
  const ids = new Set(bundle.tables.Listing.map((row) => row.id));
  for (const [table, rows] of Object.entries(bundle.tables) as [
    Table,
    Row[],
  ][]) {
    if (rows.length > 10_000)
      throw new HttpError(400, "Paket kayıt sınırını aşıyor.");
    const seen = new Set<unknown>();
    for (const row of rows) {
      const allowed = columns[table].split(" ");
      if (Object.keys(row).some((key) => !allowed.includes(key)))
        throw new HttpError(400, "Pakette desteklenmeyen alan var.");
      const key = row.id ?? row.listingId ?? row.url;
      if (typeof key !== "string" || !key || seen.has(key))
        throw new HttpError(400, "Paket kimlikleri eksik veya mükerrer.");
      seen.add(key);
      for (const [name, v] of Object.entries(row)) {
        if (/At$/.test(name) && v != null) iso.parse(v);
        if (/Url$|^url$|^discoveredFrom$/.test(name) && v != null) {
          const url = new URL(String(v));
          if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            [...url.searchParams.keys()].some((k) => privateKey.test(k))
          )
            throw new HttpError(400, "Güvensiz kaynak URL'si.");
        }
      }
      if (row.listingId && !ids.has(row.listingId))
        throw new HttpError(400, "Paket ilan referansı eksik.");
      if (row.sourceId && !sources.has(row.sourceId))
        throw new HttpError(400, "Paket kaynak referansı eksik.");
      if (table === "Listing") {
        if (
          row.isDemo !== false ||
          !row.sourceUrl ||
          !sources.has(row.sourceId)
        )
          throw new HttpError(
            400,
            "Yalnızca kaynaklı gerçek araştırma ilanları aktarılır.",
          );
        z.enum(["EV", "ARSA", "TARLA", "ARABA"]).parse(row.category);
        z.coerce.number().positive().finite().parse(row.price);
      }
      if (["ListingSource", "SearchProfile"].includes(table))
        z.array(z.enum(["EV", "ARSA", "TARLA", "ARABA"])).parse(row.categories);
      if (
        table === "ListingSource" &&
        !["PUBLIC_RESEARCH", "LICENSED_FEED"].includes(String(row.method))
      )
        throw new HttpError(400, "Özel bağlantılar aktarılamaz.");
      if (
        table === "SearchProfile" &&
        !["SILIVRI", "MARMARA_SUV"].includes(String(row.pilotKey))
      )
        throw new HttpError(400, "Yalnızca iki araştırma profili aktarılır.");
      if (table === "ResearchRun" && row.status === "RUNNING")
        throw new HttpError(400, "Devam eden araştırma aktarılamaz.");
    }
  }
  return bundle;
}

export async function exportResearchBundle(
  connectionString = process.env.DATABASE_URL,
): Promise<ResearchBundle> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const sourceIds = (
      await client.query<Row>(
        'SELECT id FROM "ListingSource" WHERE method IN ($1, $2)',
        ["PUBLIC_RESEARCH", "LICENSED_FEED"],
      )
    ).rows.map((r) => r.id);
    const listings = (
      await client.query<Row>(
        `SELECT ${quoted("Listing")} FROM "Listing" WHERE "isDemo" = false AND "sourceId" = ANY($1) ORDER BY "createdAt", id`,
        [sourceIds],
      )
    ).rows;
    const listingIds = listings.map((r) => r.id);
    const tables = {} as ResearchBundle["tables"];
    for (const table of Object.keys(columns) as Table[]) {
      let condition = "",
        values: unknown[] = [];
      if (table === "Listing") {
        tables[table] = JSON.parse(JSON.stringify(listings)).map((r: Row) =>
          clean(r, table),
        );
        continue;
      }
      if (table === "ListingSource") {
        condition = "WHERE id = ANY($1)";
        values = [sourceIds];
      } else if (columns[table].split(" ").includes("listingId")) {
        condition = 'WHERE "listingId" = ANY($1)';
        values = [listingIds];
      } else if (table === "ListingReview") {
        condition = 'WHERE "sourceId" = ANY($1)';
        values = [sourceIds];
      } else if (table === "SearchProfile") {
        condition = 'WHERE "pilotKey" = ANY($1)';
        values = [["SILIVRI", "MARMARA_SUV"]];
      } else if (table === "ResearchRun") {
        condition = "WHERE status <> 'RUNNING' ORDER BY \"startedAt\", id";
      }
      const rows = (
        await client.query<Row>(
          `SELECT ${projection(table)} FROM "${table}" ${condition}`,
          values,
        )
      ).rows;
      tables[table] = JSON.parse(JSON.stringify(rows)).map((r: Row) =>
        clean(r, table),
      );
    }
    await client.query("COMMIT");
    const payload = {
      format: "firsatradar-public-research" as const,
      version: 2 as const,
      exportedAt: new Date().toISOString(),
      tables,
    };
    return validateBundle({ ...payload, sha256: digest(payload) });
  } finally {
    client.release();
    await pool.end();
  }
}

async function insert(client: PoolClient, table: Table, row: Row) {
  const fields = Object.keys(row)
    .map((key) => `"${key}"`)
    .join(",");
  await client.query(
    `INSERT INTO "${table}" (${fields}) SELECT ${fields} FROM json_populate_record(NULL::"${table}", $1::json)`,
    [JSON.stringify(row)],
  );
}
const newer = (a: unknown, b: unknown) =>
  typeof a === "string" &&
  (!b || new Date(a).getTime() > new Date(String(b)).getTime());
function remappedId(table: Table, id: string) {
  return `transfer-${createHash("sha256").update(`${table}:${id}`).digest("hex").slice(0, 24)}`;
}

/** Preview performs the same constraints and writes in a transaction, then ROLLBACK.
 * A later apply rechecks against the current database; an old preview is not approval
 * to overwrite records which have changed since. No table is cleared or truncated. */
export async function importResearchBundle(
  value: unknown,
  apply = false,
  connectionString = process.env.DATABASE_URL,
) {
  const bundle = validateBundle(value);
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const totals = {
    inserted: 0,
    matched: 0,
    pricesAdded: 0,
    runsAdded: 0,
    conflicts: [] as string[],
    applied: apply,
    real: bundle.tables.Listing.length,
  };
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '30s'");
    // Shared with live research claiming. An active run is a durable lease too.
    await client.query("SELECT pg_advisory_xact_lock(451812)");
    if (
      (
        await client.query(
          `SELECT id FROM "ResearchRun" WHERE status='RUNNING' AND "startedAt" > now() - interval '30 minutes'`,
        )
      ).rowCount
    )
      throw new HttpError(
        409,
        "Araştırma aktifken aktarım yapılamaz; tamamlanmasını bekleyin.",
      );
    const idMap = new Map<string, string>();
    if (
      (
        await client.query(
          `SELECT id FROM "ResearchTask" WHERE status='RUNNING' AND "requestedAt" > now() - interval '30 minutes'`,
        )
      ).rowCount
    )
      throw new HttpError(
        409,
        "Araştırma aktifken aktarım yapılamaz; tamamlanmasını bekleyin.",
      );
    for (const row of bundle.tables.ListingSource) {
      const existing = (
        await client.query<Row>(
          `SELECT ${projection("ListingSource")} FROM "ListingSource" WHERE id=$1`,
          [row.id],
        )
      ).rows[0];
      if (!existing) await insert(client, "ListingSource", row);
      else if (
        !["PUBLIC_RESEARCH", "LICENSED_FEED"].includes(
          String(existing.method),
        ) ||
        existing.method !== row.method
      )
        throw new HttpError(
          400,
          "Kaynak kimliği mevcut özel kaynakla çakışıyor.",
        );
      else if (newer(row.lastSuccessAt, existing.lastSuccessAt)) {
        await client.query(
          'UPDATE "ListingSource" SET "lastSuccessAt"=$2, "accessStatus"=$3, "lastError"=$4, categories=$5, regions=$6 WHERE id=$1',
          [
            row.id,
            row.lastSuccessAt,
            row.accessStatus,
            row.lastError,
            [
              ...new Set([
                ...(existing.categories as string[]),
                ...(row.categories as string[]),
              ]),
            ],
            [
              ...new Set([
                ...(existing.regions as string[]),
                ...(row.regions as string[]),
              ]),
            ],
          ],
        );
      }
    }
    for (const row of bundle.tables.Listing) {
      const matches = (
        await client.query<Row>(
          'SELECT * FROM "Listing" WHERE "sourceId"=$1 AND (("externalId"=$2 AND $2 IS NOT NULL) OR ("sourceUrl"=$3 AND $3 IS NOT NULL))',
          [row.sourceId, row.externalId, canonicalUrl(String(row.sourceUrl))],
        )
      ).rows;
      if (matches.length > 1)
        throw new HttpError(
          400,
          "İlan ID ve URL farklı kayıtlara işaret ediyor; otomatik birleşme yapılmadı.",
        );
      const current = matches[0];
      if (current?.isDemo)
        throw new HttpError(400, "Demo kimliği gerçek ilana dönüştürülemez.");
      if (
        current &&
        (current.category !== row.category ||
          (current.externalId &&
            row.externalId &&
            current.externalId !== row.externalId))
      )
        throw new HttpError(
          400,
          "İlan kimliği/kategori çelişkisi; inceleme gerekli.",
        );
      let id = current?.id as string | undefined;
      if (!id) {
        id = String(row.id);
        if (
          (await client.query('SELECT id FROM "Listing" WHERE id=$1', [id]))
            .rowCount
        )
          id = remappedId("Listing", id);
        const provenance =
          row.provenance && typeof row.provenance === "object"
            ? (row.provenance as Row)
            : {};
        const legacyPublished = z.iso.date().safeParse(provenance.publishedAt);
        await insert(client, "Listing", {
          ...row,
          id,
          ...(row.publishedAt === undefined && legacyPublished.success
            ? { publishedAt: `${legacyPublished.data}T00:00:00.000Z` }
            : {}),
          ...(row.pageCheckedAt === undefined
            ? { pageCheckedAt: row.lastObservedAt }
            : {}),
        });
        totals.inserted++;
      } else {
        totals.matched++;
        if (
          bundle.version === 2 &&
          newer(row.pageCheckedAt, current.pageCheckedAt)
        ) {
          await client.query(
            `UPDATE "Listing" l SET "publishedAt"=COALESCE(l."publishedAt", r."publishedAt"), "sourceUpdatedAt"=r."sourceUpdatedAt", "pageCheckedAt"=r."pageCheckedAt", "priceVerifiedAt"=r."priceVerifiedAt", "priceVerification"=r."priceVerification", "availabilityStatus"=r."availabilityStatus", "availabilityVerifiedAt"=r."availabilityVerifiedAt", "verificationEvidence"=r."verificationEvidence" FROM json_populate_record(NULL::"Listing", $1::json) r WHERE l.id=$2`,
            [JSON.stringify(row), id],
          );
        }
        if (newer(row.lastObservedAt, current.lastObservedAt)) {
          await client.query(
            'UPDATE "Listing" SET price=$2, "lastObservedAt"=$3, provenance=$4, "updatedAt"=$5 WHERE id=$1',
            [
              id,
              row.price,
              row.lastObservedAt,
              JSON.stringify(row.provenance),
              row.updatedAt,
            ],
          );
        } else if (
          String(current.price) !== String(row.price) &&
          new Date(String(current.lastObservedAt)).getTime() ===
            new Date(String(row.lastObservedAt)).getTime()
        )
          throw new HttpError(
            400,
            "Aynı gözlem zamanında çelişkili fiyat var.",
          );
      }
      idMap.set(String(row.id), id);
    }
    for (const table of [
      "PropertyDetails",
      "VehicleDetails",
      "LandDetails",
      "OpportunityAssessment",
      "ListingPriceHistory",
    ] as Table[]) {
      for (const original of bundle.tables[table]) {
        const row: Row = {
          ...original,
          listingId: idMap.get(String(original.listingId)),
        };
        if (table === "OpportunityAssessment")
          Object.assign(row, {
            score: null,
            medianPrice: null,
            rangeLow: null,
            rangeHigh: null,
            relativeDifference: null,
            sampleCount: 0,
            confidence: "INSUFFICIENT",
            explanation:
              "Aktarılan tarihsel değerlendirme; güncel kalite/emsal kapısından geçmeden yeniden puanlanamaz. Özgün kararlar araştırma geçmişinde korunur.",
          });
        const where =
          table === "ListingPriceHistory"
            ? '"listingId"=$1 AND "observedAt"=$2 AND price=$3'
            : '"listingId"=$1';
        const args =
          table === "ListingPriceHistory"
            ? [row.listingId, row.observedAt, row.price]
            : [row.listingId];
        if (
          (await client.query(`SELECT 1 FROM "${table}" WHERE ${where}`, args))
            .rowCount
        )
          continue;
        if (
          row.id &&
          (await client.query(`SELECT 1 FROM "${table}" WHERE id=$1`, [row.id]))
            .rowCount
        )
          row.id = remappedId(table, String(row.id));
        // Assessments are historical. The report recomputes from evidence; never
        // trust an imported score without current independent comparables.
        await insert(client, table, row);
        if (table === "ListingPriceHistory") totals.pricesAdded++;
      }
    }
    for (const row of bundle.tables.SearchProfile) {
      if (
        (
          await client.query(
            'SELECT 1 FROM "SearchProfile" WHERE "pilotKey"=$1',
            [row.pilotKey],
          )
        ).rowCount
      )
        continue; // local preferences win
      const id = (
        await client.query('SELECT 1 FROM "SearchProfile" WHERE id=$1', [
          row.id,
        ])
      ).rowCount
        ? remappedId("SearchProfile", String(row.id))
        : row.id;
      await insert(client, "SearchProfile", { ...row, id });
    }
    for (const row of bundle.tables.ListingReview) {
      if (
        (
          await client.query(
            'SELECT 1 FROM "ListingReview" WHERE "dedupKey"=$1',
            [row.dedupKey],
          )
        ).rowCount
      )
        continue;
      const candidateIds = Array.isArray(row.candidateIds)
        ? row.candidateIds.map((id) => idMap.get(String(id)) ?? id)
        : [];
      const id = (
        await client.query('SELECT 1 FROM "ListingReview" WHERE id=$1', [
          row.id,
        ])
      ).rowCount
        ? remappedId("ListingReview", String(row.id))
        : row.id;
      await insert(client, "ListingReview", { ...row, id, candidateIds });
    }
    for (const row of bundle.tables.ResearchResource) {
      const current = (
        await client.query<Row>(
          'SELECT * FROM "ResearchResource" WHERE url=$1',
          [row.url],
        )
      ).rows[0];
      if (!current) await insert(client, "ResearchResource", row);
      else if (newer(row.lastCheckedAt, current.lastCheckedAt))
        await client.query(
          'UPDATE "ResearchResource" SET state=$2, "policyStatus"=$3, "lastCheckedAt"=$4, "lastSuccessAt"=$5, sha256=$6, "lastReason"=$7 WHERE url=$1',
          [
            row.url,
            row.state,
            row.policyStatus,
            row.lastCheckedAt,
            row.lastSuccessAt,
            row.sha256,
            row.lastReason,
          ],
        );
    }
    for (const row of bundle.tables.ResearchRun) {
      const existing = (
        await client.query<Row>('SELECT * FROM "ResearchRun" WHERE id=$1', [
          row.id,
        ])
      ).rows[0];
      if (existing) {
        if (
          stableJson(
            clean(JSON.parse(JSON.stringify(existing)), "ResearchRun"),
          ) !== stableJson(row)
        )
          throw new HttpError(
            400,
            "Araştırma kimliği farklı geçmişle çakışıyor; kronoloji değiştirilmedi.",
          );
        continue;
      }
      await insert(client, "ResearchRun", row);
      totals.runsAdded++;
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return totals;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
