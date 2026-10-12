import { z } from "zod";
import { listingSchema } from "../validation";
import { provinces } from "../constants";
import { browserSource } from "./browser-policy";
export const browserCaptureSchema=z.object({
  url:z.url().max(2048),title:z.string().min(5).max(180),text:z.string().min(30).max(60000),
  observedAt:z.iso.datetime({offset:true}).refine(v=>Date.parse(v)<=Date.now()+300000),
}).strict();
const clean=(s:string)=>s.replace(/\s+/g," ").trim();
const normalized=(s:string)=>clean(s).toLocaleLowerCase("tr-TR").replace(/[:()]/g,"").trim();
export function turkishMoney(s:string) {
  const value=clean(s).replace(/(?:TL|₺)/gi,"").trim();
  return /^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(value)?value.replaceAll(".","").replace(",","."):null;
}
export function parseBrowserCapture(raw:unknown) {
  const capture=browserCaptureSchema.parse(raw),source=browserSource(capture.url);
  // Only selected listing text. Similar offers, footer and enquiry data are excluded by the adapter.
  const lines=capture.text.split(/\r?\n|\t/).map(clean).filter(Boolean);
  const field=(...labels:string[])=>{const i=lines.findIndex(l=>labels.some(label=>normalized(l)===normalized(label)));return i>=0?lines[i+1]:undefined;};
  const fieldPrice=field("Fiyat","İlan Fiyatı");
  const amounts=[...new Set(lines.filter((l,i)=>/^(?:₺\s*[\d.,]+|[\d.,]+\s*(?:TL|₺))$/i.test(l)&&!/[Kk]ira [Gg]etirisi|[Aa]idat|[Tt]aksit|[Pp]eşinat/.test(lines[i-1]??"")).map(turkishMoney).filter((v):v is string=>!!v))];
  const price=fieldPrice?turkishMoney(fieldPrice):amounts.length===1?amounts[0]:null;
  if(!price)throw new Error("Tekil, açık ilan fiyatı belirlenemedi; birden çok fiyat veya eksik alan var.");
  let province:string|undefined,district:string|undefined,neighborhood:string|undefined;
  for(const line of lines){
    const parts=line.split("/").map(clean);
    if(parts.length<2)continue;
    if(provinces.includes(parts[0] as typeof provinces[number])){province=parts[0];district=parts[1];neighborhood=parts[2];break;}
    const last=parts.at(-1);
    if(last && provinces.includes(last as typeof provinces[number])){province=last;district=parts.at(-2)?.match(/([\p{L}]+)\s*$/u)?.[1];break;}
  }
  if(!province || !district)throw new Error("Görünen ilan konumu doğrulanamadı; URL’den konum uydurulmadı.");
  const externalId=field("İlan No","İlan Numarası")??new URL(capture.url).pathname.match(/(?:\/|\-)(\d+(?:-\d+)?)\/?$/)?.[1];
  const category=source.host==="otomol.com"||source.host==="arabam.com"?"ARABA":/satilik-arsa/.test(new URL(capture.url).pathname)?"ARSA":/satilik-tarla/.test(new URL(capture.url).pathname)?"TARLA":"EV";
  const record:Record<string,unknown>={title:capture.title,category,province,district,neighborhood,price,sourceUrl:capture.url,externalId,transactionType:"SATILIK",isDemo:false};
  if(category==="ARABA") {
    const year=field("Model Yılı","Yıl")??lines.find(l=>/^\d{4}\s*Model$/i.test(l))?.match(/\d{4}/)?.[0];
    const km=field("Kilometre","Km")??lines.find(l=>/^[\d.]+\s*km$/i.test(l));
    Object.assign(record,{modelYear:year?Number(year.replace(/\D/g,"")):undefined,mileage:km?Number(km.replace(/\D/g,"")):undefined,
      bodyType:field("Kasa Tipi"),fuel:field("Yakıt Türü","Yakıt Tipi")??lines.find(l=>/^(Elektrik|Benzin|Dizel|Hibrit|Benzin & LPG)$/.test(l)),transmission:field("Vites Tipi","Vites"),
      make:field("Marka")??capture.title.split(" ")[0],model:field("Model")??capture.title.split(" ")[1],bodyTypeVerified:false});
  } else {
    const decimal=(s?:string)=>s?.match(/^\d+(?:[.,]\d{1,2})?/)?.[0].replace(",",".");
    const combined=field("Brüt / Net M2")?.match(/^(\d+(?:,\d+)?)\s*m[²2]\s*\/\s*(\d+(?:,\d+)?)/);
    Object.assign(record,{rooms:field("Oda Sayısı","Oda Salon Sayısı"),grossM2:decimal(field("Brüt m²","m² (Brüt)"))??combined?.[1],netM2:decimal(field("Net m²","m² (Net)"))??combined?.[2],propertyType:field("Konut Tipi","İlan Tipi"),buildingAge:field("Bina Yaşı")?.match(/^\d+/)?.[0],condition:field("Yapının Durumu"),legalStatus:field("Tapu Durumu")});
  }
  const dateField=field("Yayın Tarihi","Güncelleme Tarihi","Son Güncelleme","İlan Tarihi"),date=dateField?.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  const months=["ocak","şubat","mart","nisan","mayıs","haziran","temmuz","ağustos","eylül","ekim","kasım","aralık"];
  const wordDate=dateField?.toLocaleLowerCase("tr-TR").match(/^(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})$/u);
  const month=wordDate?months.indexOf(wordDate[2]):-1;
  const sourceDate=date?`${date[3]}-${date[2]}-${date[1]}`:wordDate&&month>=0?`${wordDate[3]}-${String(month+1).padStart(2,"0")}-${wordDate[1].padStart(2,"0")}`:undefined;
  if(sourceDate && new Date(sourceDate).toISOString().slice(0,10)!==sourceDate)throw new Error("Kaynak tarihi geçersiz.");
  const sourceDateKind=field("Yayın Tarihi")?"PUBLISHED":field("Güncelleme Tarihi","Son Güncelleme")?"UPDATED":"UNSPECIFIED";
  return {record:listingSchema.parse(record),observedAt:capture.observedAt,sourceDate,sourceDateKind,
    warnings:["Sayfadaki fiyat yayıncı beyanıdır; fiyat ve satış teyidi yok.",...(!sourceDate?["İlan tarihi görünmüyor; gözlem tarihi yayın tarihi yapılmadı."]:[])],
    extractionVersion:"visible-dom-v1"};
}
