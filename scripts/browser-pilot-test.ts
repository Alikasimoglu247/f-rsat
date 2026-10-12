import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { db } from '../src/lib/db';
import { saveBrowserIntake, browserIntakeSchema } from '../src/lib/browser-intake';
import { newRealListings } from '../src/lib/discovery';
const snapshot=async()=>createHash('sha256').update(JSON.stringify(await db.listing.findMany({where:{isDemo:false},include:{property:true,vehicle:true,land:true,prices:{orderBy:{id:'asc'}}},orderBy:{id:'asc'}}))).digest('hex');
const before=await snapshot();
const baseline=await db.listing.count({where:{isDemo:false}});
const samples=[
 {title:'ÖRNEK — Silivri 2+1 konut teknik pilot',category:'EV',province:'İstanbul',district:'Silivri',price:'2500000',rooms:'2+1',grossM2:'110'},
 {title:'ÖRNEK — Bursa SUV teknik pilot',category:'ARABA',province:'Bursa',district:'Nilüfer',price:'1200000',make:'Örnek',model:'SUV A',modelYear:2022,mileage:50000,bodyType:'SUV'},
 {title:'ÖRNEK — Kocaeli SUV teknik pilot',category:'ARABA',province:'Kocaeli',district:'İzmit',price:'1500000',make:'Örnek',model:'SUV B',modelYear:2023,mileage:30000,bodyType:'SUV'},
].map((record,i)=>({record:{...record,isDemo:true,sourceUrl:`https://example.invalid/firsatradar-browser-pilot/${i+1}`,externalId:`browser-pilot-${i+1}`}, observedAt:'2026-10-12T10:00:00+03:00',sourceDate:'2026-10-10',sourceDateKind:'UNSPECIFIED',authorization:'OWN_DATA',authorizationReference:'Kurgusal teknik test verisi, gerçek marketplace içeriği değil'}));
try {
 const first=[];
 for(const sample of samples) first.push(await saveBrowserIntake(sample));
 const duplicate=await saveBrowserIntake({...samples[0],record:{...samples[0].record,sourceUrl:samples[0].record.sourceUrl+'?utm_source=test#fragment'}});
 assert.equal(duplicate.id,first[0].id);
 assert.equal(await db.listing.count({where:{sourceId:'browser-pilot-demo'}}),3);
 const changed=await saveBrowserIntake({...samples[0],observedAt:'2026-10-12T11:00:00+03:00',record:{...samples[0].record,price:'2400000'}});
 assert.equal(changed.id,first[0].id);
 await saveBrowserIntake({...samples[0],observedAt:'2026-10-12T12:00:00+03:00',record:{...samples[0].record,price:'2400000'}});
 const concurrent=await Promise.all([saveBrowserIntake(samples[1]),saveBrowserIntake(samples[1])]);
 assert.equal(concurrent[0].id,concurrent[1].id);
 const history=await db.listingPriceHistory.findMany({where:{listingId:first[0].id},orderBy:{observedAt:'asc'}});
 assert.deepEqual(history.map(p=>[p.price.toString(),p.observedAt.toISOString()]),[['2500000','2026-10-12T07:00:00.000Z'],['2400000','2026-10-12T08:00:00.000Z'],['2400000','2026-10-12T09:00:00.000Z']]);
 const stored=await db.listing.findUniqueOrThrow({where:{id:first[0].id}});
 assert.equal(stored.priceVerification,'UNVERIFIED'); assert.equal(stored.availabilityStatus,'UNKNOWN'); assert.equal(stored.publishedAt,null);
 assert.equal(browserIntakeSchema.safeParse({...samples[0],sourceDate:'2026-02-30'}).success,false);
 assert.equal(browserIntakeSchema.safeParse({...samples[0],observedAt:'2099-01-01T00:00:00Z'}).success,false);
 const discovery=await newRealListings({samples:'true'}); assert.equal(discovery.total,3);
 assert.equal(await db.listing.count({where:{isDemo:false}}),baseline); assert.equal(await snapshot(),before);
 console.log(JSON.stringify({passed:true,baselineRealCount:baseline,preservedRealRecords:true,sampleCount:3,duplicateId:duplicate.id,history:history.map(p=>({price:p.price.toString(),observedAt:p.observedAt})),discoveryCount:discovery.total,verification:stored.priceVerification,availability:stored.availabilityStatus},null,2));
} finally {await db.$disconnect();}
