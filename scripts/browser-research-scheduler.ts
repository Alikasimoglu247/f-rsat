import "dotenv/config";
import cron from "node-cron";
import { db } from "../src/lib/db";
import { queueBrowserSchedule } from "../src/lib/research/browser-jobs";
const probe=process.argv.includes("--probe"),schedule=probe?"* * * * * *":process.env.BROWSER_RESEARCH_CRON??"5 9 * * *";
if(!cron.validate(schedule))throw new Error("Geçersiz tarayıcı araştırma takvimi.");
let running=false;
const task=cron.createTask(schedule,async()=>{
  if(running)return;running=true;
  try{console.log(JSON.stringify(await queueBrowserSchedule(probe?"SCHEDULED_PROBE":"SCHEDULED")));}
  catch(e){console.error((e as Error).message);process.exitCode=1;}
  finally{running=false;if(probe){await task.stop();await task.destroy();await db.$disconnect();}}
},{timezone:"Europe/Istanbul",noOverlap:true});
await task.start();
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>{void Promise.resolve(task.stop()).then(()=>db.$disconnect()).then(()=>process.exit());});
