"use client";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { api } from "./use-api";
import { Button } from "./ui/button";
import { provinces } from "@/lib/constants";
export function BrowserIntake() {
  const panel = useRef<HTMLDetailsElement>(null);
  const [draft,setDraft] = useState<Record<string,unknown>>({});
  const [category,setCategory]=useState("EV"), [message,setMessage]=useState(""), [busy,setBusy]=useState(false);
  useEffect(()=>{
    const edit=(event:Event)=>{const value=(event as CustomEvent<Record<string,unknown>>).detail;setDraft(value);setCategory(String(value.category));setMessage("");if(panel.current){panel.current.open=true;panel.current.scrollIntoView({behavior:"smooth"});}};
    window.addEventListener("radar:browser-note",edit);
    return ()=>window.removeEventListener("radar:browser-note",edit);
  },[]);
  useEffect(()=>{
    const form=panel.current?.querySelector("form");
    if(!form)return;
    form.reset();
    for(const [key,value] of Object.entries(draft)){
      const control=form.elements.namedItem(key);
      if(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)control.value=String(value??"");
    }
    const sample=form.elements.namedItem("sample");if(sample instanceof HTMLInputElement)sample.checked=draft.isDemo===true;
    const date=form.elements.namedItem("observedAt");if(date instanceof HTMLInputElement)date.value=new Date(Date.now()+10800000).toISOString().slice(0,16);
  },[draft]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const record:Record<string,unknown>={category,isDemo:form.get("sample")==="on"};
      for(const key of ["title","sourceUrl","externalId","price","province","district","neighborhood","rooms","grossM2","make","model","modelYear","mileage","bodyType"]) {
        const value=String(form.get(key)??"").trim(); if(value) record[key]=value;
      }
      const payload={record, observedAt:new Date(String(form.get("observedAt"))+"+03:00").toISOString(), ...(form.get("sourceDate")?{sourceDate:form.get("sourceDate")}:{}),sourceDateKind:form.get("sourceDateKind"),authorization:"USER_SELECTED_NOTE",authorizationReference:"Kullanıcı tarafından tek tek girilen kişisel gözlem notu"};
      const result=await api<{id:string;outcome:string}>("browser-intake",payload);
      setMessage(`Kaydedildi (${result.outcome}). Fiyat ve satış teyit edilmedi.`); window.dispatchEvent(new Event("radar:refresh"));
    } catch(error) {setMessage((error as Error).message);} finally {setBusy(false);}
  }
  return <details ref={panel} className="panel"><summary>Seçtiğim ilanı kaydet / yeniden gözlemle</summary>
    <p>Tek tek girdiğiniz kişisel notlar kaydedilir. Kaynak adresi otomatik ziyaret edilmez. Kaynak kullanım hakkı sizde olmalıdır; sayfayı görmek güncel satış teyidi değildir.</p>
    <form onSubmit={submit}><div className="form-grid">
      <label>Başlık<input name="title" required minLength={5}/></label>
      <label>Kaynak URL<input name="sourceUrl" type="url" required/></label>
      <label>İlan ID (varsa)<input name="externalId"/></label>
      <label>Fiyat (TL, binlik ayraç olmadan)<input name="price" required pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="2500000"/></label>
      <label>Kategori<select value={category} onChange={e=>setCategory(e.target.value)}><option value="EV">Konut</option><option value="ARABA">Araç</option></select></label>
      <label>İl<select name="province" defaultValue="İstanbul">{provinces.map(p=><option key={p}>{p}</option>)}</select></label>
      <label>İlçe<input name="district" required defaultValue="Silivri"/></label>
      <label>Mahalle<input name="neighborhood"/></label>
      <label>Gözlem zamanı (Türkiye saati)<input type="datetime-local" name="observedAt" required/></label>
      <label>Kaynakta yazan ilan tarihi<input name="sourceDate" type="date"/></label>
      <label>Tarihin anlamı<select name="sourceDateKind"><option value="UNSPECIFIED">Kaynak belirtmiyor</option><option value="PUBLISHED">Yayın tarihi</option><option value="UPDATED">Güncelleme tarihi</option></select></label>
      {category==="EV"?<><label>Oda sayısı<input name="rooms" placeholder="2+1"/></label><label>Brüt m²<input name="grossM2"/></label></>:<><label>Marka<input name="make"/></label><label>Model<input name="model"/></label><label>Model yılı<input name="modelYear" type="number"/></label><label>Kilometre<input name="mileage" type="number"/></label><label>Kasa tipi<input name="bodyType" placeholder="SUV"/></label></>}
    </div><label><input type="checkbox" name="sample"/> Örnek veri (gerçek ilanlardan ayrı tutulur)</label><Button disabled={busy} type="submit">{busy?"Kaydediliyor…":"Gözlemi kaydet"}</Button><p role="status">{message}</p></form>
  </details>;
}

