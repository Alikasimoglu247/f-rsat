import { categoryKeys } from "@/lib/constants";
import type { Category } from "@/lib/constants";
export const categoriesForForm = categoryKeys;
type Field = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
};
const size: Field = { name: "sizeM2", label: "Alan (m²)", type: "number" };
export const fieldGroups: Record<Category, Field[]> = {
  EV: [
    size,
    { name: "netM2", label: "Net alan (m²)", type: "number" },
    { name: "grossM2", label: "Brüt alan (m²)", type: "number" },
    { name: "propertyType", label: "Konut tipi", placeholder: "Daire" },
    { name: "rooms", label: "Oda sayısı", placeholder: "2+1" },
    { name: "buildingAge", label: "Bina yaşı", type: "number" },
    {
      name: "condition",
      label: "Genel durum",
      placeholder: "İyi / yenilenmiş",
    },
    { name: "legalStatus", label: "Beyan edilen tapu/hukuki durum" },
    { name: "earthquakeInfo", label: "Beyan edilen deprem bilgisi" },
  ],
  ARABA: [
    {
      name: "bodyType",
      label: "Gövde tipi",
      placeholder: "SUV / CROSSOVER / SEDAN (bilinmiyorsa boş)",
    },
    { name: "bodyTypeEvidence", label: "Gövde tipi için incelenen kanıt" },
    { name: "make", label: "Marka", placeholder: "Toyota" },
    { name: "model", label: "Model", placeholder: "Corolla" },
    { name: "trim", label: "Donanım", placeholder: "1.5 Dream" },
    { name: "modelYear", label: "Model yılı", type: "number" },
    { name: "mileage", label: "Kilometre", type: "number" },
    { name: "fuel", label: "Yakıt", placeholder: "Benzin" },
    { name: "transmission", label: "Vites", placeholder: "Otomatik" },
    {
      name: "damageHistory",
      label: "Beyan edilen hasar geçmişi",
      placeholder: "Bilinmiyorsa boş bırak",
    },
  ],
  ARSA: [
    size,
    { name: "classification", label: "Arazi sınıfı", placeholder: "Arsa" },
    { name: "zoning", label: "Beyan edilen imar durumu" },
    { name: "roadAccess", label: "Beyan edilen yol erişimi" },
    { name: "parcelNumber", label: "Ada/parsel" },
    { name: "sharedOwnership", label: "Beyan edilen hisse durumu" },
  ],
  TARLA: [
    size,
    { name: "classification", label: "Arazi sınıfı", placeholder: "Tarla" },
    { name: "zoning", label: "Beyan edilen imar durumu" },
    { name: "roadAccess", label: "Beyan edilen yol erişimi" },
    { name: "parcelNumber", label: "Ada/parsel" },
    { name: "sharedOwnership", label: "Beyan edilen hisse durumu" },
    {
      name: "agriculturalRestrictions",
      label: "Beyan edilen tarımsal kısıtlar",
    },
  ],
};
