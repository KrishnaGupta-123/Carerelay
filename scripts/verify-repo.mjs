import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const staged=execFileSync("git",["diff","--cached","--name-only"],{encoding:"utf8"}).trim().split("\n").filter(Boolean);
const forbidden=staged.filter(p=>(p.startsWith(".env") && p!==".env.example") || /(^|\/)(node_modules|\.next|\.data|test-results|playwright-report)\//.test(p));
if(forbidden.length) throw new Error(`Forbidden staged files: ${forbidden.join(", ")}`);
let env="";try{env=readFileSync(".env.local","utf8");}catch{}
const secrets=env.split(/\r?\n/).filter(l=>/^(RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|CRON_SECRET|DEMO_PASSWORD)=.+/.test(l)).map(l=>l.slice(l.indexOf("=")+1)).filter(v=>v.length>10);
const violations=[];
let size=0;
for(const file of staged) {
  let content;try{content=execFileSync("git",["show",`:${file}`],{maxBuffer:20_000_000});}catch{continue;}
  size+=content.length;const text=content.toString();
  if(secrets.some(secret=>text.includes(secret)) || /\bre_[A-Za-z0-9_-]{20,}|\bsb_secret_[A-Za-z0-9_-]{20,}/.test(text)) violations.push(file);
}
if(violations.length) throw new Error(`Possible secret detected in: ${violations.join(", ")}. Values are intentionally hidden.`);
console.log(`Verified ${staged.length} staged files; ${(size/1024/1024).toFixed(2)} MB. No environment secrets or build/database artifacts included.`);
