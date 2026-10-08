import { readFile } from "node:fs/promises";
import { it, expect } from "vitest";
import {
  parseEml,
  listingReference,
  turkishPrice,
} from "../../src/lib/email/parser";
const fixture = (name: string) =>
  readFile(`tests/fixtures/emails/${name}-synthetic.eml`);
it("UTF-8 .eml metninden mevcut ilan bilgilerini ve tam kuruşu çıkarır", async () => {
  const parsed = await parseEml(await fixture("sahibinden"));
  expect(parsed.proposals).toHaveLength(1);
  expect(parsed.proposals[0].missing).toEqual([]);
  expect(parsed.proposals[0].fields).toMatchObject({
    externalId: "1234567890",
    price: "4250000.50",
    category: "EV",
    province: "İstanbul",
    district: "Kadıköy",
    sizeM2: "100",
    buildingAge: 10,
  });
  expect(parsed.proposals[0].fields.earthquakeInfo).toBeUndefined();
});
it("HTML kartından araç bilgilerini çıkarır; hiçbir dış URL'yi yüklemez", async () => {
  const parsed = await parseEml(await fixture("arabam"));
  expect(parsed.proposals[0].missing).toEqual([]);
  expect(parsed.proposals[0].fields).toMatchObject({
    externalId: "12345678",
    price: "850000",
    category: "ARABA",
    province: "Bursa",
    mileage: 75000,
  });
  expect(parsed.proposals[0].fields.damageHistory).toBeUndefined();
});
it("base64 MIME, encoded-word başlık ve quoted-printable metni çözer", async () => {
  const original = (await fixture("sahibinden")).toString();
  const [headers, body] = original.split(/\n\n/);
  const raw = `${headers.replace("Content-Transfer-Encoding: 8bit", "Content-Transfer-Encoding: base64").replace("Subject: Sentetik test arama bildirimi", "Subject: =?UTF-8?B?xLBsYW4gYmlsZGlyaW1p?=")}\n\n${Buffer.from(body).toString("base64")}`;
  const parsed = await parseEml(Buffer.from(raw));
  expect(parsed.subject).toBe("İlan bildirimi");
  expect(parsed.proposals[0].fields.price).toBe("4250000.50");
  const qp = original
    .replace(
      "Content-Transfer-Encoding: 8bit",
      "Content-Transfer-Encoding: quoted-printable",
    )
    .replace("4250xyz", "unused")
    .replace("Konum: İstanbul", "Konum: =C4=B0stanbul");
  expect((await parseEml(Buffer.from(qp))).proposals[0].fields.province).toBe(
    "İstanbul",
  );
});
it("eksik alanları uydurmaz ve çelişen fiyatları seçmez", async () => {
  const raw = (await fixture("sahibinden"))
    .toString()
    .replace("Konum: İstanbul / Kadıköy", "")
    .replace(
      "Fiyat: 4.250.000,50 TL",
      "Fiyat: 4.250.000,50 TL\nÖnceki: 4.500.000 TL",
    );
  const item = (await parseEml(Buffer.from(raw))).proposals[0];
  expect(item.fields.price).toBeUndefined();
  expect(item.fields.province).toBeUndefined();
  expect(item.missing).toEqual(
    expect.arrayContaining(["price", "province", "district"]),
  );
});
it("aynı kartta farklı ilanlar varsa fiyat/ilan eşleştirmesi yapmaz", async () => {
  const raw = (await fixture("arabam"))
    .toString()
    .replace(
      "</td><td>",
      '</a><a href="https://www.arabam.com/ilan/ikinci-el/otomobil/test/87654321">Diğer ilan</a></td><td>',
    );
  const parsed = await parseEml(Buffer.from(raw));
  expect(parsed.proposals).toHaveLength(0);
  expect(parsed.errors.length).toBeGreaterThan(0);
});
it("fiyat değişince şablon aynı, kart yapısı/gönderici değişince onay farklıdır", async () => {
  const raw = (await fixture("arabam")).toString(),
    first = await parseEml(Buffer.from(raw));
  expect(
    (await parseEml(Buffer.from(raw.replace("850.000 TL", "825.500 TL"))))
      .proposals[0].templateId,
  ).toBe(first.proposals[0].templateId);
  expect(
    (
      await parseEml(
        Buffer.from(raw.replace('class="listing-card"', 'class="new-card"')),
      )
    ).proposals[0].templateId,
  ).not.toBe(first.proposals[0].templateId);
  expect(
    (
      await parseEml(
        Buffer.from(raw.replace("bildirim@arabam.com", "other@arabam.com")),
      )
    ).proposals[0].templateId,
  ).not.toBe(first.proposals[0].templateId);
});
it("izleme yönlendirmeleri, sahte alan adları ve fazla büyük dosyalar reddedilir", async () => {
  for (const url of [
    "https://sahibinden.com.evil.test/ilan/test-1234567890/detay",
    "https://user:pass@sahibinden.com/ilan/test-1234567890/detay",
    "https://links.sahibinden.com/r?id=1234567890",
    "http://www.arabam.com/ilan/ikinci-el/test/12345678",
  ])
    expect(listingReference(url)).toBeNull();
  expect(turkishPrice("1.250.000,99 TL")).toBe("1250000.99");
  expect(turkishPrice("1.2.3 TL")).toBeUndefined();
  await expect(parseEml(Buffer.alloc(2_000_001))).rejects.toThrow();
});
it("aynı bildirim tekrarında aynı kimlik, yeni mesaj ID'sinde ayrı gözlem kimliği üretir", async () => {
  const raw = (await fixture("sahibinden")).toString();
  const first = await parseEml(Buffer.from(raw));
  expect((await parseEml(Buffer.from(raw))).contentHash).toBe(
    first.contentHash,
  );
  expect(
    (
      await parseEml(
        Buffer.from(
          raw.replace("synthetic-sahibinden-1", "synthetic-sahibinden-2"),
        ),
      )
    ).contentHash,
  ).not.toBe(first.contentHash);
});
it.each(["4250000.50 TL", "1.2.3 TL", "-1250000 TL", "1e6 TL"])(
  "belirsiz sayı %s içinden son basamakları fiyat gibi çıkarmaz",
  async (value) => {
    const raw = (await fixture("sahibinden"))
      .toString()
      .replace("4.250.000,50 TL", value);
    const item = (await parseEml(Buffer.from(raw))).proposals[0];
    expect(item.fields.price).toBeUndefined();
    expect(item.missing).toContain("price");
  },
);
it("döviz tutarından TL fiyatı uydurmaz; belirsiz km ondalığını birleştirmez", async () => {
  const raw = (await fixture("arabam"))
    .toString()
    .replace("850.000 TL", "10000 USD ve kredi: 500 TL")
    .replace("75.000", "7.5");
  const item = (await parseEml(Buffer.from(raw))).proposals[0];
  expect(item.fields.price).toBeUndefined();
  expect(item.fields.mileage).toBeUndefined();
  expect(turkishPrice("1 250 000,99 TL")).toBe("1250000.99");
  expect(turkishPrice("1 23 TL")).toBeUndefined();
});
