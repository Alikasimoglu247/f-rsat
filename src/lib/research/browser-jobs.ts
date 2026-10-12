import { randomUUID, createHash } from "node:crypto";
import { db } from "../db";
import { HttpError } from "../http";
import { canonicalUrl } from "../listings";
import { saveBrowserIntake } from "../browser-intake";
import { browserSources,browserPolicy,browserGrants,browserSource } from "./browser-policy";
import { browserCaptureSchema,parseBrowserCapture } from "./browser-extraction";
type Job = {url:string;mode:"USER_SELECTED"|"AUTOMATIC";kind:"DETAIL"|"DISCOVERY";leaseToken?:string;leaseUntil?:string;reason?:string};
type Preview=ReturnType<typeof parseBrowserCapture>;
const shared=globalThis as unknown as {radarBrowserPreviews?:Map<string,{expires:number;preview:Preview}>};
const previews=shared.radarBrowserPreviews??=new Map();
function object(value:unknown){return value as Job;}
const ACTION="BROWSER_RESEARCH";
export async function queueBrowserJob(url:string,mode:Job["mode"]="USER_SELECTED",kind:Job["kind"]="DETAIL") {
  browserSource(url);const policy=browserPolicy(url);
  if(mode==="AUTOMATIC" && !policy.canDiscover)throw new HttpError(403,"Kaynağın otomatik araştırma izni doğrulanmadı.");
  if(mode==="USER_SELECTED" && kind!=="DETAIL")throw new HttpError(403,"Kullanıcı seçimi tek ilanla sınırlıdır.");
  if(kind==="DETAIL" && !/(?:\/|\-)[0-9]+(?:-[0-9]+)?\/?$/.test(new URL(url).pathname))throw new HttpError(400,"Arama sayfası değil, tekil ilan URL’si seçin.");
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451809)::text`;
    const pending=await tx.researchTask.findMany({where:{action:ACTION,status:{in:["QUEUED","RUNNING"]}},take:30});
    const existing=pending.find(j=>canonicalUrl(object(j.result).url)===canonicalUrl(url));
    if(existing)return {id:existing.id,status:existing.status,policy};
    const task=await tx.researchTask.create({data:{action:ACTION,status:"QUEUED",result:{url:canonicalUrl(url)!,mode,kind}}});
    return {id:task.id,status:task.status,policy};
  });
}
export async function claimBrowserJob(id:string) {
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451809)::text`;
    const task=await tx.researchTask.findUniqueOrThrow({where:{id}}),job=object(task.result);
    if(task.action!==ACTION || !["QUEUED","RUNNING"].includes(task.status))throw new HttpError(409,"İstek alınamaz.");
    if(task.status==="RUNNING" && Date.parse(job.leaseUntil??"")>Date.now())throw new HttpError(409,"İstek başka ajan tarafından alındı.");
    if(job.mode==="AUTOMATIC" && !browserPolicy(job.url).canDiscover)throw new HttpError(403,"Kaynak izni yok veya sona erdi.");
    const leaseToken=randomUUID();
    await tx.researchTask.update({where:{id},data:{status:"RUNNING",result:{...job,leaseToken,leaseUntil:new Date(Date.now()+300000).toISOString()}}});
    return {id,url:job.url,mode:job.mode,kind:job.kind,leaseToken};
  });
}
export async function finishBrowserJob(id:string,leaseToken:string,page:unknown,links:string[]=[]) {
  const capture=browserCaptureSchema.parse(page);
  const task=await db.researchTask.findUniqueOrThrow({where:{id}}),job=object(task.result);
  if(task.action!==ACTION || task.status!=="RUNNING" || job.leaseToken!==leaseToken || Date.parse(job.leaseUntil??"")<Date.now())throw new HttpError(409,"Ajan oturumu geçersiz veya süresi doldu.");
  if(canonicalUrl(capture.url)!==canonicalUrl(job.url))throw new HttpError(400,"İstek URL’si ve tarayıcıdaki ilan eşleşmiyor.");
  if(/verify you are human|checking your browser|access denied|güvenlik doğrulaması|erişim engellendi/i.test(capture.text))throw new HttpError(403,"Erişim engeli görüldü; işlem durduruldu.");
  const policy=browserPolicy(job.url);
  if(job.mode==="AUTOMATIC" && !policy.canDiscover)throw new HttpError(403,"Otomatik araştırma izni yok; işlem durduruldu.");
  if(job.kind==="DISCOVERY") {
    const candidates=[...new Set(links)].filter(u=>{try{return browserSource(u).host===policy.host && /(?:\/|\-)[0-9]+(?:-[0-9]+)?\/?$/.test(new URL(u).pathname);}catch{return false;}}).slice(0,3);
    for(const url of candidates)await queueBrowserJob(url,"AUTOMATIC");
    await db.researchTask.update({where:{id},data:{status:"COMPLETED",completedAt:new Date(),result:{url:job.url,mode:job.mode,kind:job.kind,discovered:candidates.length}}});
    return {status:"COMPLETED",discovered:candidates.length};
  }
  const preview=parseBrowserCapture(capture);
  const digest=createHash("sha256").update(JSON.stringify(preview)).digest("hex");
  if(!policy.canStore){
    // Restricted platform facts stay in short-lived memory; never Listing, history or task JSON.
    previews.set(id,{expires:Date.now()+600000,preview});
    await db.researchTask.update({where:{id},data:{status:"PREVIEW_ONLY",completedAt:new Date(),result:{url:job.url,mode:job.mode,kind:job.kind,reason:policy.restriction,extractedFields:Object.keys(preview.record),sha256:digest}}});
    return {id,status:"PREVIEW_ONLY",preview,reason:policy.restriction};
  }
  const existing=await db.listing.findMany({where:{sourceUrl:canonicalUrl(preview.record.sourceUrl),isDemo:false},select:{id:true,sourceId:true}});
  if(existing.length>1)throw new HttpError(409,"Kaynak URL’si birden çok mevcut kayda bağlı; otomatik birleşme yapılmadı.");
  const saved=await saveBrowserIntake({record:preview.record,observedAt:preview.observedAt,sourceDate:preview.sourceDate,sourceDateKind:preview.sourceDateKind,authorization:"WRITTEN_PERMISSION",authorizationReference:policy.grantReference}, {sourceId:existing[0]?.sourceId??`browser-${policy.host}`});
  await db.researchTask.update({where:{id},data:{status:"SAVED",completedAt:new Date(),result:{url:job.url,mode:job.mode,kind:job.kind,listingId:saved.id,outcome:saved.outcome,sha256:digest}}});
  return {id,status:"SAVED",listingId:saved.id,outcome:saved.outcome};
}
export async function failBrowserJob(id:string,leaseToken:string,reason:string) {
  const task=await db.researchTask.findUniqueOrThrow({where:{id}}),job=object(task.result);
  if(task.action!==ACTION || task.status!=="RUNNING" || job.leaseToken!==leaseToken)throw new HttpError(409,"Geçersiz ajan oturumu.");
  await db.researchTask.update({where:{id},data:{status:"BLOCKED",completedAt:new Date(),result:{url:job.url,mode:job.mode,kind:job.kind,reason:reason.slice(0,400)}}});
  return {status:"BLOCKED"};
}
export async function browserResearchState(){
  for(const [id,p] of previews)if(p.expires<Date.now())previews.delete(id);
  const tasks=await db.researchTask.findMany({where:{action:{in:[ACTION,"BROWSER_SCHEDULE"]}},orderBy:{requestedAt:"desc"},take:20});
  return {runtime:"CODEX_TOOL_SESSION_REQUIRED",sources:browserSources.map(s=>browserPolicy(`https://www.${s.host}/`)),tasks:tasks.map(t=>{const result={...t.result as Record<string,unknown>};delete result.leaseToken;return {...t,result,preview:previews.get(t.id)?.preview??null};})};
}
export async function queueBrowserSchedule(trigger="SCHEDULED") {
  const grants=browserGrants();let queued=0;
  for(const grant of grants){
    for(const url of grant.discoveryUrls){await queueBrowserJob(url,"AUTOMATIC","DISCOVERY");queued++;}
    const existing=await db.listing.findMany({where:{isDemo:false,sourceUrl:{contains:grant.host}},select:{sourceUrl:true},take:3});
    for(const url of [...new Set([...grant.listingUrls,...existing.map(l=>l.sourceUrl!)])].slice(0,3)){await queueBrowserJob(url,"AUTOMATIC");queued++;}
  }
  const result={trigger,queued,authorizedSources:grants.length,runtime:"CODEX_TOOL_SESSION_REQUIRED",reason:grants.length?"İstekler sırada; yerleşik tarayıcı Node sürecinden çağrılamaz. Codex ajan köprüsü gerekli.":"Açık otomasyon/saklama izni bulunmadığı için kaynak taraması başlatılmadı.",at:new Date().toISOString()};
  const task=await db.researchTask.create({data:{action:"BROWSER_SCHEDULE",status:queued?"WAITING_FOR_AGENT":"NO_AUTHORIZED_SOURCE",result,completedAt:new Date()}});
  return {id:task.id,...result};
}
