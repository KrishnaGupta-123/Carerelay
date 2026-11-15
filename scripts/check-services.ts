import {config} from "dotenv";
config({path:".env.local",quiet:true});
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(url && key) {
  const res=await fetch(`${url}/rest/v1/rpc/care_bootstrap`,{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify({requested_profile:null})});
  const body=await res.json();
  console.log(JSON.stringify({service:"supabase",status:res.status,code:body.code,message:body.message,configured:body.code==="42501"}));
}
if(process.env.RESEND_API_KEY) {
  const res=await fetch("https://api.resend.com/domains",{headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`}});
  const body=await res.json();
  console.log(JSON.stringify({service:"resend",status:res.status,message:body.message || "API reachable",domains:body.data?.map((d:{name:string;status:string})=>({name:d.name,status:d.status}))}));
}
