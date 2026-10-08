import { it, expect } from "vitest";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
it("M1→M2 migration fiyatları, kaynakları ve gözlemleri korur; eski birleşmeler puanlanmaz", async () => {
  const target = new URL(process.env.TEST_DATABASE_URL!);
  const name = `radar_migration_${randomBytes(6).toString("hex")}_test`;
  target.pathname = "/postgres";
  const admin = new pg.Pool({ connectionString: target.toString() });
  let created = false;
  target.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: target.toString() });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await pool.query(
      await readFile(
        "prisma/migrations/202610080001_initial/migration.sql",
        "utf8",
      ),
    );
    await pool.query(
      `INSERT INTO "ListingSource" (id,name,method,"authorization",categories) VALUES ('csv','CSV','CSV','user',ARRAY['EV']::"Category"[]),('json','JSON','JSON','user',ARRAY['EV']::"Category"[])`,
    );
    await pool.query(
      `INSERT INTO "Listing" (id,title,category,province,district,price,"sourceUrl","externalId","identityKey","sourceId",provenance,"updatedAt") VALUES ('legacy','Eski korunacak ilan','EV','İstanbul','Kadıköy',1234567.89,'https://example.com/42','42','legacy-fingerprint','csv','{"original":"preserve"}',NOW())`,
    );
    await pool.query(
      `INSERT INTO "ListingPriceHistory" (id,"listingId",price,provenance) VALUES ('h1','legacy',1300000.75,'{"acquisitionSource":"csv"}'),('h2','legacy',1234567.89,'{"acquisitionSource":"json"}')`,
    );
    await pool.query(`INSERT INTO "Watchlist" ("listingId") VALUES ('legacy')`);
    await pool.query(
      `INSERT INTO "OpportunityAssessment" (id,"listingId","sampleCount",confidence,score,"riskFlags",explanation) VALUES ('a','legacy',8,'HIGH',90,'[]','old')`,
    );
    await pool.query(
      await readFile(
        "prisma/migrations/202610080002_m2_email_identity/migration.sql",
        "utf8",
      ),
    );
    await pool.query(
      await readFile(
        "prisma/migrations/202610080003_email_delivery_retry/migration.sql",
        "utf8",
      ),
    );
    const result = await pool.query(
      `SELECT price,"sourceId",provenance,"identityStatus","identityVersion" FROM "Listing" WHERE id='legacy'`,
    );
    expect(result.rows[0]).toMatchObject({
      price: "1234567.89",
      sourceId: "csv",
      provenance: { original: "preserve" },
      identityStatus: "REVIEW",
      identityVersion: 1,
    });
    expect(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM "ListingPriceHistory"`))
        .rows[0].n,
    ).toBe(2);
    expect(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM "Watchlist"`)).rows[0]
        .n,
    ).toBe(1);
    expect(
      (
        await pool.query(
          `SELECT COUNT(*)::int AS n FROM "ListingReview" WHERE kind='LEGACY_AMBIGUITY'`,
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await pool.query(
          `SELECT COUNT(*)::int AS n FROM "OpportunityAssessment"`,
        )
      ).rows[0].n,
    ).toBe(0);
    await pool.query(
      `INSERT INTO "Listing" (id,title,category,province,district,price,"sourceUrl","externalId","identityKey","sourceId",provenance,"updatedAt") VALUES ('other','Diğer kaynak aynı URL','EV','İstanbul','Kadıköy',1234567.89,'https://example.com/42','42','legacy-fingerprint','json','{}',NOW())`,
    );
    expect(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM "Listing"`)).rows[0].n,
    ).toBe(2);
  } finally {
    await pool.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});
