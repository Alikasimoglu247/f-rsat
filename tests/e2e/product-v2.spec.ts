import { expect, test } from "@playwright/test";
import pg from "pg";
import legacy from "../../src/data/silivri-research.json" with { type: "json" };
import { resetE2eFixtures } from "./reset";
const researchSegments = [
  "DEGIRMENKOY_LAND",
  "SELIMPASA_HOME",
  "CENTRAL_HOME",
  "SILIVRI_LAND",
  "MARMARA_SUV",
  "CENTRAL_THREE_ROOM",
].map((id) => ({ id }));
async function poolWork(work: (pool: pg.Pool) => Promise<void>) {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_e2e")) throw new Error("Guard");
  const p = new pg.Pool({ connectionString: url });
  try {
    await work(p);
  } finally {
    await p.end();
  }
}
async function publicFixture() {
  await resetE2eFixtures();
  await poolWork(async (p) => {
    const at = new Date().toISOString(),
      retryAfter = new Date(Date.now() + 86400_000).toISOString();
    await p.query(
      "INSERT INTO \"ListingSource\" (id,name,method,\"authorization\",categories,regions) VALUES ($1,$2,$3,$4,ARRAY['ARSA','ARABA']::\"Category\"[],ARRAY['İstanbul / Silivri'])",
      [
        "v2-test-source",
        "SENTETİK V2 kaynak",
        "PUBLIC_RESEARCH",
        "Sadece ayrı E2E DB testi",
      ],
    );
    const candidates = [];
    const sources = [];
    for (const [id, category, price, model] of [
      ["v2-land", "ARSA", "440000", ""],
      ["v2-car-a", "ARABA", "990000", "X3"],
      ["v2-car-b", "ARABA", "1100000", "X5"],
    ]) {
      const url = "https://www.genccity.com/synthetic-v2/" + id;
      await p.query(
        'INSERT INTO "Listing" (id,title,category,province,district,neighborhood,"transactionType",price,"sourceUrl","externalId","identityKey","sourceId","isDemo",provenance,"collectedAt","lastObservedAt","createdAt","updatedAt") VALUES ($1,$2,$3::"Category",\'İstanbul\',\'Silivri\',\'Değirmenköy\',\'Satılık\',$4,$5,$1,$1,\'v2-test-source\',false,\'{}\',$6,$6,$6,$6)',
        [id, "SENTETİK V2 " + id, category, price, url, at],
      );
      await p.query(
        'INSERT INTO "ListingPriceHistory" (id,"listingId",price,"observedAt",provenance) VALUES ($1,$2,$3,$4,\'{}\')',
        [id + "-price", id, price, at],
      );
      const vehicle =
        category === "ARABA"
          ? {
              make: "BMW",
              model,
              trim: "Test",
              modelYear: 2024,
              mileage: 12000,
              fuel: "Benzin",
              bodyType: "SUV",
              bodyTypeVerified: true,
              bodyTypeEvidence: "SENTETİK gövde testi",
              damageHistory: null,
            }
          : undefined;
      if (vehicle)
        await p.query(
          'INSERT INTO "VehicleDetails" ("listingId",make,model,trim,"modelYear",mileage,fuel,"bodyType","bodyTypeVerified","bodyTypeEvidence") VALUES ($1,\'BMW\',$2,\'Test\',2024,12000,\'Benzin\',\'SUV\',true,\'SENTETİK gövde testi\')',
          [id, model],
        );
      else
        await p.query(
          'INSERT INTO "LandDetails" ("listingId","sizeM2") VALUES ($1,300)',
          [id],
        );
      sources.push({
        ...legacy.sources[0],
        id,
        url,
        sha256: "a".repeat(64),
        retrievedAt: at,
        checkStatus: "VALID",
      });
      candidates.push({
        ...legacy.candidates[0],
        id,
        sourceId: id,
        sourceUrl: url,
        externalId: id,
        title: "SENTETİK V2 " + id,
        category,
        price,
        observedAt: at,
        publishedAt: null,
        factIds: [],
        riskSignals: [],
        features: ["SENTETİK kaynak özelliği"],
        vehicle,
      });
    }
    const snapshot = {
      ...legacy,
      researchedAt: at,
      sources,
      candidates,
      facts: [],
    };
    const memory = Object.fromEntries(
      researchSegments.map((s) => [
        s.id,
        {
          attempts: 1,
          emptyRounds: 1,
          lastRunAt: at,
          retryAfter,
          freshCandidates: 0,
          eligibleCandidates: 0,
          duplicateCandidates: 0,
          missing: ["SENTETİK test bekleme süresi"],
        },
      ]),
    );
    await p.query(
      "INSERT INTO \"ResearchRun\" (id,trigger,segment,status,\"startedAt\",\"completedAt\",summary,snapshot,decisions,changes,checks,discoveries) VALUES ($1,'MANUAL','SENTETİK V2 segment','PARTIAL',$2,$2,$3::jsonb,$4::jsonb,'[]','[]',$5::jsonb,'[]')",
      [
        "v2-synthetic-run",
        at,
        JSON.stringify({
          strategy: {
            version: 1,
            segmentId: "DEGIRMENKOY_LAND",
            memory,
            reason: "SENTETİK test stratejisi",
            changedFrom: null,
            deferredUntil: null,
          },
          checkedUrls: 1,
          parsedSources: 1,
          inserted: 3,
        }),
        JSON.stringify(snapshot),
        JSON.stringify([
          {
            url: "https://www.genccity.com/synthetic-blocked",
            status: "ACCESS_BLOCKED",
            checkedAt: at,
            reason: "SENTETİK test erişim engeli; aşılmadı.",
          },
        ]),
      ],
    );
  });
}

test("Cloud paket önizlemesi, gerçek kayıtların içe aktarılması ve tekrarında idempotency", async ({
  page,
}) => {
  await publicFixture();
  const bundle = await (await page.request.get("/api/research/export")).json();
  expect(bundle.tables.Listing).toHaveLength(3);
  await poolWork(async (p) => {
    await p.query('DELETE FROM "Listing" WHERE "sourceId"=\'v2-test-source\'');
    await p.query("DELETE FROM \"ResearchRun\" WHERE id='v2-synthetic-run'");
  });
  await page.goto("/arastirma-merkezi");
  await page
    .getByRole("region", { name: "İlk kurulum durumu" })
    .getByRole("button", { name: "Araştırma paketi yükle" })
    .click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Araştırma paketi (.json)").setInputFiles({
    name: "public-test.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await expect(modal.locator(".v2-transfer-preview")).toContainText(
    "3 yeni ilan",
  );
  expect(
    (await (await page.request.get("/api/product")).json()).counts.real,
  ).toBe(0);
  await modal
    .getByRole("button", { name: "Doğrulanan paketi içe aktar" })
    .click();
  await expect(modal.locator(".v2-transfer-preview")).toContainText(
    "Aktarım tamamlandı",
  );
  const after = await (await page.request.get("/api/product")).json();
  expect(after.counts).toMatchObject({ real: 3, properties: 1, vehicles: 2 });
  await modal.getByLabel("Araştırma paketi (.json)").setInputFiles({
    name: "public-test.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await expect(modal.locator(".v2-transfer-preview")).toContainText(
    "0 yeni ilan",
  );
  await modal
    .getByRole("button", { name: "Doğrulanan paketi içe aktar" })
    .click();
  await expect(modal.locator(".v2-transfer-preview")).toContainText(
    "0 fiyat gözlemi",
  );
  await modal.getByRole("button", { name: "Pencereyi kapat" }).click();
  await page.goto("/kesfet");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Marmara SUV", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
});
test("arayüz gerçek motoru çağırır; cooldown yeni araştırma başarısı gibi gösterilmez ve yetkisiz istek reddedilir", async ({
  page,
}) => {
  await publicFixture();
  await page.goto("/arastirma-merkezi");
  await page
    .getByRole("button", { name: "Yeni araştırma başlat", exact: true })
    .click();
  await expect(page.locator(".v2-task-result")).toContainText(
    "Kaynaklar bekleme süresinde",
  );
  await expect(page.locator(".v2-task-result")).toContainText(
    "Yeni ağ araştırması yapılmadı",
  );
  const report = await (await page.request.get("/api/product")).json();
  expect(report.counts.researchRuns).toBe(1);
  expect(report.tasks[0].status).toBe("DEFERRED");
  const bad = await page.request.post("/api/research/start", {
    data: {},
    headers: { Origin: "https://evil.example" },
  });
  expect(bad.status()).toBe(403);
  const repeat = await page.request.post("/api/research/start", {
    data: {},
    headers: { Origin: "http://127.0.0.1:3001" },
  });
  expect(repeat.status()).toBe(429);
  await page.locator(".v2-run summary").click();
  await expect(
    page.getByRole("region", { name: "Araştırma döngüsü" }),
  ).toContainText("Erişim engellendi");
});
test("gerçek aday detayları, filtreler, yanlış SUV emsali uyarısı ve kalıcı gerçek takip listesi", async ({
  page,
}) => {
  await publicFixture();
  await page.goto("/kesfet?pilot=MARMARA_SUV");
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByLabel("En yüksek fiyat (₺)", { exact: true }).fill("1000000");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("En yüksek fiyat (₺)", { exact: true }).fill("");
  for (const c of await page.getByRole("article").all())
    await c.getByRole("checkbox", { name: "Karşılaştır" }).check();
  await page.getByRole("button", { name: "Karşılaştır", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Bu araçlar fiyat emsali değildir",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "fiyat avantajı puanı üretilmez",
  );
  await page.getByRole("button", { name: "Pencereyi kapat" }).click();
  await page
    .getByRole("button", { name: "Analizi aç", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("Hasar: Doğrulanmadı");
  await page.getByRole("button", { name: "Takibe al", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Takipten çıkar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pencereyi kapat" }).click();
  await page.goto("/takip-listem");
  await page.getByRole("button", { name: "Marmara SUV", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Marmara SUV", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
