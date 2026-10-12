"use client";
import { useState,useEffect } from "react";
import { api,useApi } from "./use-api";
import { Button } from "./ui/button";
import { money,dateTime } from "@/lib/constants";
type Preview={record:{title:string;price:string;province:string;district:string;sourceUrl?:string;[key:string]:unknown};observedAt:string;sourceDate?:string;warnings:string[]};
type State={runtime:string;sources:{name:string;host:string;mode:string;restriction:string}[];tasks:{id:string;status:string;requestedAt:string;result:{url?:string;reason?:string;listingId?:string};preview:Preview|null}[]};
export function BrowserResearch(){
  const {data,refresh}=useApi<State>("browser-research"),[url,setUrl]=useState(""),[message,setMessage]=useState(""),[selected,setSelected]=useState(""),[lease,setLease]=useState(""),[capture,setCapture]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{const timer=setInterval(refresh,5000);return()=>clearInterval(timer);},[refresh]);
  async function request(){setBusy(true);try{const r=await api<{id:string}>("browser-research/queue",{url});setSelected(r.id);setMessage("İstek sıraya alındı. Yerleşik tarayıcıya erişen Codex ajanı inceleyecek; bağımsız uygulama tarayıcıyı kontrol edemez.");refresh();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  async function claim(){try{const r=await api<{leaseToken:string}>("browser-research/claim",{id:selected});setLease(r.leaseToken);setMessage("Ajan isteği aldı.");refresh();}catch(e){setMessage((e as Error).message);}}
  async function finish(){try{const envelope=JSON.parse(capture);const r=await api<{status:string}>("browser-research/capture",{id:selected,leaseToken:lease,page:envelope.page??envelope,links:envelope.links??[]});setMessage(r.status==="PREVIEW_ONLY"?"Gerçek ilan ayrıştırıldı. Kaynak izni yok: yalnızca geçici önizleme; veritabanına aktarılmadı.":"Araştırma sonucu kaydedildi.");setLease("");setCapture("");refresh();window.dispatchEvent(new Event("radar:refresh"));}catch(e){setMessage((e as Error).message);}}
  return <section className="panel" aria-label="Tarayıcı destekli araştırma"><h3>İlanı tarayıcıda incele</h3>
    <p>İlan bağlantısını seçin; alanları ajan çıkarır. Hepsiemlak, Emlakjet ve arabam.com kapsamda kalır. Yetkisiz otomatik toplama ve kalıcı aktarım yapılmaz.</p>
    <label>Seçtiğim ilan URL’si<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.otomol.com/...-9462"/></label>
    <Button disabled={busy||!url} onClick={request}>İlanı tarayıcıda incele</Button><p role="status">{message}</p>
    <p className="helper">Tarayıcı yürütücüsü: Codex masaüstü araç oturumu. Günlük Node zamanlayıcısı istek oluşturabilir; tarayıcı araçlarını kendi başına çağıramaz.</p>
    <details><summary>Kaynak erişim ve izin durumu</summary>{data?.sources.map(s=><p key={s.host}>{s.name}: {s.mode==="AUTHORIZED_AUTOMATION"?"Belgeli otomasyon":"Kullanıcı seçimiyle inceleme"}. {s.restriction}</p>)}</details>
    {data?.tasks.map(t=><article key={t.id}><p>{dateTime(t.requestedAt)} · {t.status} · {t.result.url??"Günlük tarayıcı araştırması"}</p>{t.result.reason&&<p>{t.result.reason}</p>}
      {t.preview&&<div aria-label="Gerçek ilan önizlemesi"><h4>{t.preview.record.title}</h4><p>{money(t.preview.record.price)} · {t.preview.record.province} / {t.preview.record.district}</p><p>Gözlem: {dateTime(t.preview.observedAt)} · Kaynak tarihi: {t.preview.sourceDate??"Görünmüyor"} · Fiyat/satış: teyitsiz</p><dl className="info-list">{Object.entries(t.preview.record).filter(([k,v])=>!["title","price","sourceUrl","province","district","isDemo"].includes(k)&&v!=null).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>{t.preview.warnings.map(w=><p key={w}>{w}</p>)}<p>Önizleme 10 dakika sonra veya uygulama yeniden başladığında silinir; ilan/veritabanı kaydı oluşturulmadı.</p></div>}
    </article>)}
    <details><summary>Codex ajan bağlantısı</summary><p>Bu denetimler yerleşik tarayıcı ajanının DOM sonucunu iletmesi içindir; kullanıcıdan ilan alanlarını doldurması istenmez.</p>
      <label>Ajan iş isteği<select value={selected} onChange={e=>{setSelected(e.target.value);setLease("");}}><option value="">İstek seçin</option>{data?.tasks.filter(t=>["QUEUED","RUNNING"].includes(t.status)).map(t=><option key={t.id} value={t.id}>{t.id} — {t.result.url}</option>)}</select></label>
      <Button disabled={!selected||!!lease} onClick={claim}>Ajan isteğini al</Button>
      <label>Tarayıcı DOM sonucu<textarea value={capture} onChange={e=>setCapture(e.target.value)} rows={3}/></label>
      <Button disabled={!lease||!capture} onClick={finish}>Tarayıcı sonucunu işle</Button>
    </details>
  </section>;
}
