import type { PrismaClient } from "@prisma/client";
import { categoryKeys } from "../constants";
export const sourceDefinitions = [
  {
    id: "manual",
    name: "Manuel giriş",
    method: "MANUAL",
    authorization: "Kullanıcının sağladığı, kullanım hakkı bulunan bilgi.",
    accessStatus: "AVAILABLE",
  },
  {
    id: "csv",
    name: "CSV içe aktarma",
    method: "CSV",
    authorization: "Dosyanın kullanım hakkı kullanıcıya ait olmalı.",
    accessStatus: "AVAILABLE",
  },
  {
    id: "json",
    name: "JSON içe aktarma",
    method: "JSON",
    authorization: "Dosyanın kullanım hakkı kullanıcıya ait olmalı.",
    accessStatus: "AVAILABLE",
  },
  {
    id: "email",
    name: "İzinli arama e-postası",
    method: "EMAIL_IMPORT",
    authorization:
      "Kullanıcının yüklediği JSON/CSV e-posta gövdesi. Mailbox bağlantısı yok.",
    accessStatus: "AVAILABLE",
  },
  {
    id: "demo",
    name: "Demo veri seti",
    method: "DEMO",
    authorization: "Tamamı kurgusal, gerçek marketplace verisi değil.",
    accessStatus: "DEMO",
  },
  {
    id: "licensed-feed",
    name: "Yetkili API / lisanslı feed",
    method: "AUTHORIZED_JSON",
    authorization: "Sabit HTTPS hedefi ve veri kullanım anlaşması gerekir.",
    accessStatus: "DISCONNECTED",
  },
  ...[
    ["sahibinden-email", "Sahibinden bildirim e-postası"],
    ["arabam-email", "Arabam.com bildirim e-postası"],
  ].map(([id, name]) => ({
    id,
    name,
    method: "USER_AUTHORIZED_EMAIL",
    authorization:
      "Kullanıcı seçimi ve örnek şablon onayı gerekir. Gerçek platform örneği depoda doğrulanmadı; ilan URL'si ziyaret edilmez.",
    accessStatus: "NEEDS_SAMPLE",
  })),
  ...["Sahibinden", "Arabam", "Hepsiemlak", "Emlakjet"].map((name) => ({
    id: name.toLocaleLowerCase("en-US"),
    name,
    method: "PLANNED",
    authorization:
      "Resmi API/lisans anlaşması doğrulanmadı. Site taraması yapılmaz.",
    accessStatus: "PLANNED",
  })),
];
export async function ensureSources(client: PrismaClient) {
  for (const source of sourceDefinitions)
    await client.listingSource.upsert({
      where: { id: source.id },
      create: {
        ...source,
        categories:
          source.id === "arabam-email" ? ["ARABA"] : [...categoryKeys],
      },
      update: {
        name: source.name,
        method: source.method,
        authorization: source.authorization,
        categories:
          source.id === "arabam-email" ? ["ARABA"] : [...categoryKeys],
      },
    });
  await client.appSettings.upsert({
    where: { id: "personal" },
    create: {},
    update: {},
  });
}
