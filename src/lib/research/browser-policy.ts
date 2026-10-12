import { z } from "zod";
export const browserSources = [
  {host:"hepsiemlak.com",name:"Hepsiemlak",termsUrl:"https://www.hepsiemlak.com/kullanim-kosullari",restriction:"Yazılı izin olmadan otomatik izleme ve veritabanı derleme kısıtlı."},
  {host:"emlakjet.com",name:"Emlakjet",termsUrl:"https://www.emlakjet.com/kullanim-kosullari",restriction:"Madde 6.2: yazılı izin olmadan robot ve veri madenciliği yasak."},
  {host:"arabam.com",name:"arabam.com",termsUrl:"https://www.arabam.com/bireysel-uyelik-sozlesmesi",restriction:"Madde 6.2: derleme, işleme ve başka veritabanına aktarım kısıtlı."},
  {host:"otomol.com",name:"Otomol",termsUrl:"https://www.otomol.com/kisisel-verilerin-korunmasi",restriction:"İlan görüntüleme mümkün; açık otomatik derleme/saklama izni doğrulanmadı."},
  {host:"genccity.com",name:"Genç City",termsUrl:"https://www.genccity.com/",restriction:"Açık otomatik derleme/saklama izni doğrulanmadı."},
  {host:"gayrimenkulakgun.com",name:"Akgün Gayrimenkul",termsUrl:"https://www.gayrimenkulakgun.com/",restriction:"Açık otomatik derleme/saklama izni doğrulanmadı."},
] as const;
const grantSchema = z.object({
  host:z.string(), reference:z.string().min(8), termsUrl:z.url(),
  allowStorage:z.literal(true), allowAutomation:z.literal(true),
  robotsAllowed:z.literal(true), termsAutomationAllowed:z.literal(true),
  checkedAt:z.iso.datetime({offset:true}), expiresAt:z.iso.datetime({offset:true}),
  discoveryUrls:z.array(z.url()).max(3).default([]),
  listingUrls:z.array(z.url()).max(10).default([]),
}).strict();
export type BrowserGrant = z.infer<typeof grantSchema>;
export function browserSource(url:string) {
  const parsed=new URL(url);
  if(parsed.protocol!=="https:" || parsed.username || parsed.password || (parsed.port && parsed.port!=="443")) throw new Error("Yalnızca kimlik bilgisi içermeyen HTTPS kaynakları kabul edilir.");
  const host=parsed.hostname.toLowerCase().replace(/^www\./,"");
  const source=browserSources.find(s=>s.host===host);
  if(!source)throw new Error("Bu kaynak tarayıcı araştırma kataloğunda yok.");
  return source;
}
/** Server configuration only. Browser-supplied permission flags cannot enable crawling. */
export function browserGrants(raw=process.env.BROWSER_RESEARCH_GRANTS_JSON,now=new Date()):BrowserGrant[] {
  if(!raw)return [];
  const grants=z.array(grantSchema).max(6).parse(JSON.parse(raw));
  return grants.filter(g=>browserSources.some(s=>s.host===g.host) &&
    Date.parse(g.expiresAt)>now.getTime() && Date.parse(g.checkedAt)<=now.getTime() && now.getTime()-Date.parse(g.checkedAt)<=7*86400000 &&
    [...g.discoveryUrls,...g.listingUrls,g.termsUrl].every(u=>browserSource(u).host===g.host));
}
export function browserPolicy(url:string,grants=browserGrants()) {
  const source=browserSource(url),grant=grants.find(g=>g.host===source.host);
  return {...source,mode:grant?"AUTHORIZED_AUTOMATION":"USER_DIRECTED_REVIEW_ONLY",canStore:!!grant,canDiscover:!!grant,grantReference:grant?.reference??null};
}
