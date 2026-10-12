import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectResearch,
  parseDivisionContext,
  parseHousingText,
  parseInflation,
  parseLandPage,
  parsePolicy,
  parseTurkishAmount,
  parseToggFinance,
} from "@/lib/research/acquisition";
import {
  accessChallenge,
  contentSignalAllows,
  robotsAllows,
  safeResearchUrl,
  termsRestrictAutomation,
} from "@/lib/research/policy";
import { fetchResearchPage } from "@/lib/research/transport";
import type {
  ResearchFetchResult,
  ResearchFetcher,
} from "@/lib/research/types";

// Synthetic minimal excerpts reproduce verified public markup. They are never imported into the application database.
const url =
  "https://www.genccity.com/satilik-arsa/degirmenkoy-300-metre/049048057054";
const checkedAt = "2026-10-10T06:00:00.000Z";
function page(body: string, address = url, status = 200): ResearchFetchResult {
  return {
    url: address,
    body,
    status,
    checkedAt,
    sha256: createHash("sha256").update(body).digest("hex"),
    contentType: "text/html",
  };
}
function listing(price = "440.000 TL", extra = "", area = "300") {
  return `<html><head><title>SİLİVRİ DEĞİRMENKÖY 300 METRE ARSA - Değirmenköy</title></head><body><form>
    İstanbul Silivri Değirmenköy İlan No: 1096 <b itemprop="price">${price}</b>
    <dl><dt>İlan Tarihi</dt><dd>22.Ocak.2026</dd><dt>Kategori</dt><dd>Satılık Arsa</dd><dt>Metrekare</dt><dd>${area}</dd>
    <dt>İmar Durumu</dt><dd>Bilgi Yok</dd><dt>Tapu Durumu</dt><dd>Bilgi Yok</dd><dt>Ada</dt><dd>344</dd><dt>Parsel</dt><dd>91</dd></dl>
    ${extra}<input name="security">Soru sor: Güvenlik Doğrulaması</form></body></html>`;
}
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("bounded live research acquisition", () => {
  it("yeniden okumada ilgili araçlar bilinen ilanların fiyat kontrolü bütçesini tüketmez", async () => {
    const address = (id: number) =>
      `https://www.otomol.com/volvo-ex40-2026-ikinci-el-araba-${id}`;
    const car = (id: number) =>
      `<h1>VOLVO EX40 Ultra</h1><span class="text-2xl">₺3.300.000</span><div><span>İlan No</span><span>${id}</span></div><div><span>Kasa Tipi</span><span>SUV</span></div><div><span>Model Yılı</span><span>2026</span></div><div><span>Kilometre</span><span>8.841</span></div><div><span>Yakıt Türü</span><span>Elektrik</span></div><div><span>Vites Tipi</span><span>Otomatik</span></div><div><span>Şube</span><h3>Merter</h3><p>Osmaniye Mah. Bakırköy/İstanbul</p></div><script>self.__next_f.push([1,${JSON.stringify("15:" + JSON.stringify({ props: { marka: "VOLVO", model: "EX40", altModel: "Ultra", ilanNo: id, fiyat: "3.300.000", modelYili: 2026, km: 8841 } }) + "\n")}])</script><a href="${address(99)}">İlgili araç</a>`;
    const calls: string[] = [];
    const acquired = await collectResearch({
      segmentId: "MARMARA_SUV",
      refreshEconomy: false,
      pageBudget: 2,
      knownUrls: [address(1), address(2)],
      fetcher: async (u) => {
        calls.push(u);
        return page(
          u.endsWith("/robots.txt")
            ? "User-agent: *\nAllow: /"
            : u === address(1)
              ? car(1)
              : u === address(2)
                ? car(2)
                : "<p>Genel bilgi</p>",
          u,
        );
      },
    });
    expect(acquired.candidates.map((c) => c.externalId)).toEqual(["1", "2"]);
    expect(calls).not.toContain(address(99));
    const expanded = await collectResearch({
      segmentId: "MARMARA_SUV",
      refreshEconomy: false,
      pageBudget: 3,
      knownUrls: [1, 2, 3, 4].map(address),
      fetcher: async (u) =>
        page(
          u.endsWith("/robots.txt")
            ? "User-agent: *\nAllow: /"
            : u === "https://www.otomol.com/"
              ? `<a href="${address(99)}">Yeni araç</a>`
              : /-ikinci-el-araba-\d+$/.test(u)
                ? car(Number(u.split("-").at(-1)))
                : "<p>Genel bilgi</p>",
          u,
        ),
    });
    expect(expanded.candidates.map((c) => c.externalId)).toEqual([
      "1",
      "2",
      "99",
    ]);
  });
  it("AI grounding reservation is honored separately from ordinary robots and training", () => {
    expect(
      contentSignalAllows(
        "User-agent: *\nAllow: /\nContent-Signal: search=yes,ai-input=no,ai-train=no",
      ),
    ).toBe(false);
    expect(
      contentSignalAllows(
        "# Content-Signal: ai-input=no\nUser-agent: *\nAllow: /\nContent-Signal: ai-train=no",
      ),
    ).toBe(true);
  });
  it("written-permission storage restrictions and Turkish user terms cannot be missed", () => {
    expect(
      termsRestrictAutomation(
        "Yes Oto'nun yazılı onayı olmadan Site'nin içeriği kopyalanamaz, işlenemez.",
      ),
    ).toBe(true);
    expect(
      termsRestrictAutomation(
        "Yazılı izni olmaksızın içerik kopya edilmesi, depolanması ve işlenmesi yasaktır.",
      ),
    ).toBe(true);
  });
  it("verified T10X campaign markup preserves credit terms, not a car price or T10F SUV listing", () => {
    const row = (version: string, rate: string) =>
      `<div class="od-table-content-row"><div>${version}</div><div>800.000 TL</div><div class="term-wrapper">6 ay</div><div class="interest-rate-wrapper">${rate} %</div><div class="monthly-payment-wrapper">133.333 TL</div></div>`;
    const facts = parseToggFinance(
      page(
        row("T10X V2", "0,00") +
          row("T10X V2", "0,00") +
          row("T10F V2", "0,00"),
        "https://www.togg.com.tr/sales-and-finance",
      ),
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      value: 0,
      unit: "% / ay",
      sourceId: "togg-finance",
    });
    expect(facts[0].label).toContain("araç satış fiyatı değildir");
    expect(parseToggFinance(page(row("T10X V2", "bilinmiyor")))).toEqual([]);
  });
  it("keeps an undated shared-plot campaign as context without importing its historic price or deed status", () => {
    const context = page(
      '<title></title><h4 class="classic-title">İSTANBUL SİLİVRİ DEĞİRMENKÖYDE ÖZEL PARSELASYONLU ARSALAR</h4><p>400 METRE KARE HİSSELİ ARSALAR 28 BİN TLYE SATIŞA SUNULDU</p>',
    );
    const facts = parseDivisionContext(context);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      value: null,
      period: "",
      scope: expect.stringContaining("tekil parsel bağlantısı yok"),
    });
    expect(facts[0].label).not.toContain("28");
    expect(facts[0].field).toBeUndefined();
    expect(
      parseDivisionContext(
        page("<title>Başka yer</title><p>Hisseli arsalar</p>"),
      ),
    ).toEqual([]);
  });
  it("parses the selected TL price and keeps absent legal fields unknown inside an ASP.NET form", () => {
    const candidate = parseLandPage(page(listing()))!.candidate;
    expect(candidate).toMatchObject({
      price: "440000",
      sizeM2: "300",
      externalId: "1096",
      parcelNumber: "344/91",
      publishedAt: "2026-01-22",
      zoning: null,
      roadAccess: null,
      sharedOwnership: null,
    });
    expect(candidate.evidence).toBeUndefined();
    expect(candidate.limitations.join(" ")).toContain("satışın hâlâ açık");
    expect(accessChallenge(listing())).toBe(false);
  });
  it("never substitutes a headline price, zero, foreign currency or malformed amount", () => {
    for (const value of [
      "Fiyat sorunuz",
      "0 TL",
      "440.000 USD",
      "440,000.50 TL",
    ])
      expect(parseLandPage(page(listing(value)))!.candidate.price).toBeNull();
    expect(parseTurkishAmount("12.500.000 TL")).toBe("12500000");
    expect(parseTurkishAmount("3421,85")).toBe("3421.85");
  });
  it("does not parse unused feature options as verified property attributes", () => {
    const candidate = parseLandPage(
      page(
        listing(
          "440.000 TL",
          "<div>Hisseli İmarlı Yol Cepheli İnşaat Ruhsatı Alınmış</div>",
        ),
      ),
    )!.candidate;
    expect(candidate.sharedOwnership).toBeNull();
    expect(candidate.zoning).toBeNull();
    expect(candidate.roadAccess).toBeNull();
  });
  it("flags Turkish uppercase zoning claims and independent external reference conflicts", () => {
    const body =
      listing().replace("300 METRE ARSA", "İMARLI 300 METRE ARSA") +
      "<p>İLAN NO 10694</p>";
    const candidate = parseLandPage(page(body))!.candidate;
    expect(candidate.riskSignals.some((s) => s.includes("imar"))).toBe(true);
    expect(candidate.externalReferenceConflict).toBe(true);
    expect(candidate.externalId).toBeNull();
  });
  it("recognizes a title-only m² area without inventing legal classification", () => {
    const candidate = parseLandPage(
      page(
        listing()
          .replace("300 METRE", "250 m²")
          .replace("<dd>300</dd>", "<dd>Bilgi Yok</dd>"),
      ),
    )!.candidate;
    expect(candidate.sizeM2).toBe("250");
    expect(candidate.classification).toBeNull();
    expect(candidate.limitations.join(" ")).toContain("başlık beyanı");
  });
  it("rejects Sahibinden and every unsupported account platform before any HTTP request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const forbidden of [
      "https://www.sahibinden.com/",
      "https://m.sahibinden.com/",
      "https://www.arabam.com/",
      "http://www.genccity.com/",
      "https://127.0.0.1/",
      "https://www.genccity.com:444/",
      "https://user:password@www.genccity.com/",
    ]) {
      expect(safeResearchUrl(forbidden)).toBe(false);
      await expect(fetchResearchPage(forbidden)).rejects.toMatchObject({
        code: "POLICY_REVIEW",
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not follow forbidden redirects or same-host robots-disallowed redirects", async () => {
    for (const target of [
      "https://www.sahibinden.com/",
      "https://www.genccity.com/admin/",
    ]) {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 302, headers: { Location: target } }),
        );
      vi.stubGlobal("fetch", fetch);
      await expect(fetchResearchPage(url)).rejects.toMatchObject({
        code: "POLICY_REVIEW",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
  it("stops on access rejection without retrying", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("denied", { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchResearchPage(url)).rejects.toMatchObject({
      code: "ACCESS_BLOCKED",
      httpStatus: 403,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      accessChallenge("<title>CAPTCHA</title><p>Verify you are human</p>"),
    ).toBe(true);
  });
  it("honors specific and wildcard robots rules, allow precedence and query restrictions", () => {
    const robots =
      "User-agent: *\nDisallow: /admin\nDisallow: /search?*\nAllow: /admin/public\nUser-agent: FirsatRadarResearch\nDisallow: /private\n";
    expect(robotsAllows(robots, "https://www.genccity.com/private")).toBe(
      false,
    );
    expect(
      robotsAllows(robots, "https://www.genccity.com/admin", "OtherAgent"),
    ).toBe(false);
    expect(
      robotsAllows(
        robots,
        "https://www.genccity.com/admin/public",
        "OtherAgent",
      ),
    ).toBe(true);
    expect(
      robotsAllows(robots, "https://www.genccity.com/search?x=1", "OtherAgent"),
    ).toBe(false);
    expect(
      robotsAllows(
        "User-agent: Firsat\nAllow: /admin\nUser-agent: FirsatRadarResearch\nDisallow: /admin",
        "https://www.genccity.com/admin",
      ),
    ).toBe(false);
  });
  it("detects explicit automation restrictions while distinguishing copyright and commercial licences", () => {
    expect(
      termsRestrictAutomation(
        "Automated collection and scraping are prohibited.",
      ),
    ).toBe(true);
    expect(
      termsRestrictAutomation("İzin olmadan otomatik veri toplama yapılamaz."),
    ).toBe(true);
    expect(
      termsRestrictAutomation(
        "Tüm hakları saklıdır. Kaynak göstererek kullanım mümkündür; ticari kullanım izne tabidir.",
      ),
    ).toBe(false);
  });
  it("reads current dated economic values and correctly aligns Istanbul rather than the adjacent regional PDF column", () => {
    const policy = parsePolicy(
      page(
        "<body>10 Eylül 2026 politika faizi olan bir hafta vadeli repo ihale faiz oranının yüzde 37’de sabit tutulmasına karar verilmiştir.</body>",
      ),
    );
    expect(policy[0]).toMatchObject({ value: 37, period: "2026-09-10" });
    const inflation = parseInflation(
      page(
        "<table><tr><td>09-2026</td><td>29.73</td><td>1.84</td></tr><tr><td>08-2026</td><td>31.51</td><td>1.84</td></tr></table>",
      ),
    );
    expect(inflation.map((f) => f.value)).toEqual([29.73, 31.51]);
    const text =
      "AĞUSTOS 2026\nTR21 (Edirne)             TR10 (İstanbul)              TR9 (Artvin)\n %13,0                     %26,3                        %25,7\nnominal olarak yüzde 23,0 oranında artmış, reel olarak ise yüzde 6,5 oranında azalmıştır.";
    expect(
      parseHousingText(text).find((f) => f.id === "housing-istanbul")?.value,
    ).toBe(26.3);
    expect(
      parseHousingText("AĞUSTOS 2026 TR10 (İstanbul) başka metin %13,0"),
    ).toEqual([]);
  });
  it("performs fresh acquisition again and discovers the next real link frontier using persisted known URLs", async () => {
    const second =
      "https://www.genccity.com/satilik-arsa/degirmenkoy-250-metre/049048055056";
    let currentPrice = "440.000 TL",
      calls: string[] = [];
    const fetcher: ResearchFetcher = async (address) => {
      calls.push(address);
      if (address.endsWith("/robots.txt"))
        return page("User-agent: *\nAllow: /", address);
      if (address === "https://www.genccity.com/")
        return page(
          `<body><a href="${url}">Değirmenköy 300 metre</a><a href="${second}">Değirmenköy 250 metre</a></body>`,
          address,
        );
      if (address === url) return page(listing(currentPrice), address);
      if (address === second)
        return page(
          listing("450.000 TL")
            .replace("1096", "1078")
            .replace("300 METRE", "250 METRE")
            .replace("<dd>300</dd>", "<dd>250</dd>"),
          address,
        );
      return page("<body>Not found</body>", address, 404);
    };
    const first = await collectResearch({ pageBudget: 1, fetcher });
    expect(first.candidates).toHaveLength(1);
    currentPrice = "430.000 TL";
    calls = [];
    const next = await collectResearch({
      knownUrls: first.sources.map((s) => s.url),
      pageBudget: 1,
      fetcher,
    });
    expect(next.candidates).toHaveLength(2);
    expect(calls).toContain(url);
    expect(calls).toContain(second);
    expect(next.candidates.find((c) => c.sourceUrl === url)?.price).toBe(
      "430000",
    );
    expect(next.sources.find((s) => s.url === url)?.sha256).not.toBe(
      first.sources[0].sha256,
    );
    expect(next.candidates.every((c) => c.observedAt === checkedAt)).toBe(true);
  });
  it("does not read listing links after linked terms prohibit automated access", async () => {
    const calls: string[] = [];
    const fetcher: ResearchFetcher = async (address) => {
      calls.push(address);
      if (address.endsWith("robots.txt"))
        return page("User-agent: *\nAllow: /", address);
      if (address === "https://www.genccity.com/")
        return page(
          `<body><a href="/terms">Site Kullanım Koşulları ve Yasal Uyarı</a><a href="${url}">Değirmenköy 300 metre</a></body>`,
          address,
        );
      if (address === "https://www.genccity.com/terms")
        return page(
          "<body>Automated collection is prohibited.</body>",
          address,
        );
      return page("missing", address, 404);
    };
    const result = await collectResearch({ fetcher });
    expect(result.candidates).toHaveLength(0);
    expect(calls).not.toContain(url);
    expect(result.checks.some((c) => c.status === "POLICY_REVIEW")).toBe(true);
  });
  it("defers previously blocked hosts without sending any request", async () => {
    const calls: string[] = [];
    const fetcher: ResearchFetcher = async (address) => {
      calls.push(address);
      return page("missing", address, 404);
    };
    const result = await collectResearch({
      knownUrls: [url],
      blockedUrls: [url],
      fetcher,
    });
    expect(calls.some((address) => address.includes("genccity.com"))).toBe(
      false,
    );
    expect(
      result.checks.some((c) => c.url === url && c.status === "ACCESS_BLOCKED"),
    ).toBe(true);
  });
  it("does not fall back to known listings when linked terms cannot be verified", async () => {
    const calls: string[] = [];
    const fetcher: ResearchFetcher = async (address) => {
      calls.push(address);
      if (address.endsWith("/robots.txt"))
        return page("User-agent: *\nAllow: /", address);
      if (address === "https://www.genccity.com/")
        return page(
          "<body><a href='/terms'>Kullanım Şartları</a></body>",
          address,
        );
      return page("Not found", address, 404);
    };
    const result = await collectResearch({ knownUrls: [url], fetcher });
    expect(calls).not.toContain(url);
    expect(result.checks.some((c) => c.status === "POLICY_REVIEW")).toBe(true);
  });
});
