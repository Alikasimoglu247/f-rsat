import { describe, expect, it } from "vitest";
import { browserIntakeSchema } from "../../src/lib/browser-intake";
const input = {record:{title:"Örnek konut ilanı",category:"EV",province:"İstanbul",district:"Silivri",price:"2500000",sourceUrl:"https://example.invalid/1",isDemo:true},observedAt:"2026-10-12T10:00:00+03:00",sourceDate:"2026-10-10",sourceDateKind:"UNSPECIFIED",authorization:"OWN_DATA",authorizationReference:"Kurgusal teknik test verisi"};
describe("browser observation validation",()=>{
  it("keeps a local date separate from offset-aware observation time",()=>expect(browserIntakeSchema.parse(input).sourceDate).toBe("2026-10-10"));
  it("requires identity and rejects impossible or later source dates",()=>{
    expect(browserIntakeSchema.safeParse({...input,record:{...input.record,sourceUrl:undefined}}).success).toBe(false);
    expect(browserIntakeSchema.safeParse({...input,sourceDate:"2026-02-30"}).success).toBe(false);
    expect(browserIntakeSchema.safeParse({...input,sourceDate:"2026-10-13"}).success).toBe(false);
  });
  it("rejects future observations and client-supplied verification claims",()=>{
    expect(browserIntakeSchema.safeParse({...input,observedAt:"2099-01-01T00:00:00Z"}).success).toBe(false);
    expect(browserIntakeSchema.safeParse({...input,priceVerification:"VERIFIED"}).success).toBe(false);
  });
});
