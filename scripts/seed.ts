import { config } from "dotenv";
config({path:".env.local",quiet:true});config({quiet:true});
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { seedLocal,demoAccounts } from "../src/server/seed";
const local=process.argv.includes("--local");
if(local) {
  process.env.LOCAL_DEVELOPMENT_MODE="true";
  const password=process.env.DEMO_PASSWORD || `Care-${randomBytes(10).toString("base64url")}!`;
  const result=await seedLocal(password);
  if(result.created) {
    await writeFile(".data/demo-accounts.json",JSON.stringify({password,accounts:demoAccounts},null,2));
    console.log("Local demo credentials saved to .data/demo-accounts.json (ignored by Git).");
  }
  console.log(result.message);
} else {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY,password=process.env.DEMO_PASSWORD;
  if(!url || !service || !password || password.length<12) throw new Error("Hosted seed requires SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD (12+ characters). Use --local for the development demo.");
  const client=createClient(url,service,{auth:{persistSession:false}});
  const accounts=[];
  for(const acc of demoAccounts) {
    const {data,error}=await client.auth.admin.createUser({email:acc.email,password,email_confirm:true,user_metadata:{name:acc.name}});
    if(error) throw new Error(`${acc.email}: ${error.message}. Existing users are never overwritten.`);
    accounts.push({user:data.user!,account:acc});
  }
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sessions=[];
  for(const acc of accounts) {
    const c=createClient(url,key,{auth:{persistSession:false}});
    const {error}=await c.auth.signInWithPassword({email:acc.account.email,password});if(error) throw error;
    sessions.push(c);
  }
  const {data:p,error:pError}=await sessions[0].rpc("care_action",{profile_:null,kind_:"create_profile",payload_:{preferred_name:"Meera",timezone:"Asia/Kolkata",date_of_birth:"1952-03-18",notes:"Synthetic demonstration profile"}});
  if(pError) throw pError;
  for(let i=1;i<sessions.length;i++) {
    const {data:invite,error}=await sessions[0].rpc("care_action",{profile_:p.id,kind_:"invite",payload_:{role:accounts[i].account.role,can_invite:i===1}});if(error) throw error;
    const {error:joinError}=await sessions[i].rpc("care_action",{profile_:null,kind_:"join",payload_:{code:invite.code}});if(joinError) throw joinError;
  }
  console.log("Hosted demo Auth accounts and care circle created. Use the app to add medication and appointment records, or run the full local seed to demonstrate all sample workflows.");
}
process.exit(0);
