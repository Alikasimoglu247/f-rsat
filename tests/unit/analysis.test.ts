import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  assess,
  comparablePrice,
  quantile,
  riskFlags,
} from "../../src/lib/analysis";
import type { Evidence } from "../../src/lib/analysis";
const now = new Date("2026-10-08T09:00:00Z");
const subject: Evidence = {
  id: "target",
  title: "Test daire",
  category: "EV",
  province: "İstanbul",
  district: "Kadıköy",
  price: "100",
  isDemo: false,
  lastObservedAt: now,
  property: {
    sizeM2: "100",
    propertyType: "Daire",
    rooms: "2+1",
    buildingAge: 10,
    condition: "İyi",
  },
};
const candidate = (
  id: number,
  price: string,
  extra: Partial<Evidence> = {},
): Evidence => ({ ...subject, id: `c-${id}`, price, ...extra });
describe("kanıta dayalı fiyat analizi", () => {
  it("medyanı exact decimal aritmetik ile hesaplar", () =>
    expect(
      quantile(
        ["0.10", "0.20", "0.30", "0.40"].map(
          (value) => new Prisma.Decimal(value),
        ),
        0.5,
      ).toFixed(2),
    ).toBe("0.25"));
  it("aykırı fiyatı çıkarır ve kalan gerçek emsal sayısını bildirir", () => {
    const result = assess(
      subject,
      ["110", "120", "125", "130", "135", "140", "150", "2000"].map(
        (price, i) => candidate(i, price),
      ),
      now,
    );
    expect(result.sampleCount).toBe(7);
    expect(result.medianPrice).toBe("130.00");
    expect(result.relativeDifference).toBe("23.0769");
    expect(result.score).toBe(81);
    expect(result.confidence).toBe("MEDIUM");
    expect(result.comparables).not.toContainEqual(
      expect.objectContaining({ id: "c-7" }),
    );
  });
  it("aykırı filtre sonrasında beş emsal yoksa puanı kapatır", () => {
    const result = assess(
      subject,
      ["110", "120", "130", "140", "10000"].map((price, i) =>
        candidate(i, price),
      ),
      now,
    );
    expect(result.sampleCount).toBe(4);
    expect(result.score).toBeNull();
    expect(result.medianPrice).toBeNull();
  });
  it("demo ve gerçek kayıtları birbirine emsal yapmaz", () =>
    expect(
      comparablePrice(subject, candidate(0, "100", { isDemo: true }), now),
    ).toBeNull());
  it("farklı ilçe, oda, bina yaşı veya eski gözlemi reddeder", () => {
    expect(
      comparablePrice(
        subject,
        candidate(0, "100", { district: "Beşiktaş" }),
        now,
      ),
    ).toBeNull();
    expect(
      comparablePrice(
        subject,
        candidate(0, "100", {
          property: { ...subject.property, rooms: "3+1" },
        }),
        now,
      ),
    ).toBeNull();
    expect(
      comparablePrice(
        subject,
        candidate(0, "100", {
          property: { ...subject.property, buildingAge: 30 },
        }),
        now,
      ),
    ).toBeNull();
    expect(
      comparablePrice(
        subject,
        candidate(0, "100", { lastObservedAt: new Date("2026-01-01") }),
        now,
      ),
    ).toBeNull();
  });
  it("alan farkını m² üzerinden normalleştirir", () =>
    expect(
      comparablePrice(
        subject,
        candidate(0, "110", {
          property: { ...subject.property, sizeM2: "110" },
        }),
        now,
      )?.toFixed(2),
    ).toBe("100.00"));
  it("araç donanım, kilometre ve hasar beyanını eşleştirir", () => {
    const vehicle: Evidence = {
      ...subject,
      category: "ARABA",
      property: null,
      vehicle: {
        make: "Toyota",
        model: "Corolla",
        trim: "Dream",
        modelYear: 2021,
        mileage: 60000,
        fuel: "Benzin",
        transmission: "Otomatik",
        damageHistory: "Beyan: kayıt yok",
      },
    };
    expect(
      comparablePrice(
        vehicle,
        { ...vehicle, id: "other", price: "120" },
        now,
      )?.toString(),
    ).toBe("120");
    expect(
      comparablePrice(
        vehicle,
        {
          ...vehicle,
          id: "other",
          vehicle: { ...vehicle.vehicle, trim: "Flame" },
        },
        now,
      ),
    ).toBeNull();
    expect(
      comparablePrice(
        vehicle,
        {
          ...vehicle,
          id: "other",
          vehicle: { ...vehicle.vehicle, mileage: 160000 },
        },
        now,
      ),
    ).toBeNull();
    expect(
      comparablePrice(
        vehicle,
        {
          ...vehicle,
          id: "other",
          vehicle: { ...vehicle.vehicle, damageHistory: undefined },
        },
        now,
      ),
    ).toBeNull();
  });
  it("imar veya yol bilgisi yokken arsa/tarlaya puan uydurmaz", () => {
    const land: Evidence = {
      ...subject,
      category: "ARSA",
      property: null,
      land: { sizeM2: "100", classification: "Arsa" },
    };
    expect(
      assess(
        land,
        Array.from({ length: 8 }, (_, i) => ({ ...land, id: `land${i}` })),
        now,
      ).score,
    ).toBeNull();
    expect(
      riskFlags({ ...land, category: "TARLA" }).map((flag) => flag.code),
    ).toEqual(
      expect.arrayContaining([
        "ZONING",
        "OWNERSHIP",
        "ROAD",
        "CADASTRE",
        "AGRICULTURE",
      ]),
    );
  });
  it("tüm risk bayraklarını doğrulanmamış olarak işaretler", () =>
    expect(riskFlags(subject).every((flag) => flag.verified === false)).toBe(
      true,
    ));
  it("saklanan ilk fiyat gözleminden değişimi hesaplar", () => {
    const listing = {
      ...subject,
      price: "90",
      prices: [
        { price: "95", observedAt: "2026-10-07T00:00:00Z" },
        { price: "100", observedAt: "2026-10-01T00:00:00Z" },
      ],
    };
    expect(assess(listing, [], now).priceChange).toBe("-10.0000");
  });
  it("eski hedef ilan için yeterli emsal olsa da puan vermez", () =>
    expect(
      assess(
        { ...subject, lastObservedAt: "2026-01-01" },
        Array.from({ length: 8 }, (_, i) => candidate(i, "120")),
        now,
      ).score,
    ).toBeNull());
  it("çok düşük fiyatı doğrulama gerektiren belirsizlik olarak gösterir", () => {
    const result = assess(
      { ...subject, price: "40" },
      Array.from({ length: 8 }, (_, i) => candidate(i, "120")),
      now,
    );
    expect(result.riskFlags).toContainEqual(
      expect.objectContaining({ code: "LOW_PRICE", verified: false }),
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
