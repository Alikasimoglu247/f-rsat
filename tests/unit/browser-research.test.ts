import { expect,it } from "vitest";
import { browserPolicy,browserGrants,browserSource } from "../../src/lib/research/browser-policy";
import { parseBrowserCapture,turkishMoney } from "../../src/lib/research/browser-extraction";
const page={url:"https://www.otomol.com/synthetic-suv-999999",title:"ÖRNEK SUV TEST",observedAt:"2026-10-12T10:00:00+03:00",text:"ÖRNEK SUV TEST\n2023 Model\n45.000 km\nDizel\nKasa Tipi\nSUV\nVites Tipi\nOtomatik\n₺1.234.567,89\nİlan No:\n999999\nŞube\nÖrnek Mah. No:1 Nilüfer/Bursa"};
it("parses visible fields precisely without inventing publication or sale proof",()=>{
  const v=parseBrowserCapture(page);expect(v.record).toMatchObject({price:"1234567.89",province:"Bursa",district:"Nilüfer",modelYear:2023,mileage:45000,externalId:"999999",bodyType:"SUV"});expect(v.sourceDate).toBeUndefined();expect(v.sourceDateKind).toBe("UNSPECIFIED");expect(v.record.bodyTypeVerified).toBe(false);
});
it("never takes a title number, loan instalment or conflicting related offer as price",()=>{
  expect(turkishMoney("1.234.567,89 TL")).toBe("1234567.89");
  expect(()=>parseBrowserCapture({...page,text:page.text.replace("₺1.234.567,89","12 ay 100.000 TL") })).toThrow("fiyat");
  expect(()=>parseBrowserCapture({...page,text:page.text+"\n₺900.000"})).toThrow("fiyat");
});
it("keeps all three marketplaces in review scope and rejects network/credential tricks",()=>{
  for(const host of ["hepsiemlak.com","emlakjet.com","arabam.com"])expect(browserPolicy(`https://www.${host}/`,[])).toMatchObject({canStore:false,canDiscover:false,mode:"USER_DIRECTED_REVIEW_ONLY"});
  for(const url of ["http://www.otomol.com/1","https://user:password@www.otomol.com/1","https://otomol.com.evil.example/1","https://127.0.0.1/1"])expect(()=>browserSource(url)).toThrow();
});
it("requires a server grant with robots, terms, storage scope and unexpired checks",()=>{
  const grant={host:"otomol.com",reference:"SENTETIK TEST GRANT",termsUrl:"https://www.otomol.com/terms",allowStorage:true,allowAutomation:true,robotsAllowed:true,termsAutomationAllowed:true,checkedAt:"2026-10-12T00:00:00Z",expiresAt:"2026-10-13T00:00:00Z",discoveryUrls:[],listingUrls:[]};
  const at=new Date("2026-10-12T10:00:00Z");expect(browserGrants(JSON.stringify([grant]),at)).toHaveLength(1);
  expect(browserGrants(JSON.stringify([{...grant,expiresAt:"2026-10-11T00:00:00Z"}]),at)).toHaveLength(0);
  expect(()=>browserGrants(JSON.stringify([{...grant,robotsAllowed:false}]),at)).toThrow();
});
it("separates sale price from rent and preserves explicitly labelled update date",()=>{
  const estate={url:"https://www.hepsiemlak.com/synthetic-villa/999999-1",title:"ÖRNEK Silivri villa",observedAt:page.observedAt,text:"₺2.500.000\nİstanbul / Silivri / Alibey\nKonut Tipi\nVilla\nOda Sayısı\n3 + 2\nBrüt / Net M2\n170 m2 / 150 m2\nSon Güncelleme\n09/10/2026\nKira Getirisi\n60.000 TL"};
  expect(parseBrowserCapture(estate)).toMatchObject({record:{price:"2500000",grossM2:"170",netM2:"150",rooms:"3 + 2"},sourceDate:"2026-10-09",sourceDateKind:"UPDATED"});
});
