import "server-only";
import { Resend } from "resend";
import { timingSafeEqual, createHash } from "node:crypto";
import type { User } from "@/lib/types";
import { isLocalMode, localDb, localRpc } from "./local-db";
import { supabaseWorker } from "./supabase";
import { CareError, callCareRpc } from "./care";
interface OutboxItem { id:string; email:string; subject:string; body:string; idempotency_key:string; }
export function escapeHtml(value:string) { return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!)); }
export function emailHtml(subject:string,body:string) {
  const url = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `<div style="background:#f5f7f5;padding:40px 16px;font-family:Arial,sans-serif;color:#18312f"><div style="max-width:520px;margin:auto;background:#fff;padding:36px;border-radius:16px;border:1px solid #dce7e3"><p style="font-size:22px;font-weight:700;color:#136b5f">CareRelay</p><h1 style="font-size:22px;line-height:1.4">${escapeHtml(subject)}</h1><p style="font-size:16px;line-height:1.8;color:#536763">${escapeHtml(body)}</p><a href="${escapeHtml(url)}/dashboard" style="display:inline-block;padding:14px 24px;background:#177966;color:white;border-radius:8px;text-decoration:none">Open CareRelay</a><p style="margin-top:32px;color:#788782;font-size:12px;line-height:1.6">Shared care. Clear responsibilities. Better coordination.<br>CareRelay records reports and supports coordination. It does not verify ingestion or replace healthcare professionals. Manage email preferences in your account settings.</p></div></div>`;
}
async function workerRpc<T>(local:boolean,operation:string,payload:unknown = {}):Promise<T> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length<32) throw new CareError("Configure CRON_SECRET (at least 32 characters) and its database hash to process emails.","configuration",503);
  if (local) {
    const db = await localDb();
    // Explicit local development setup only. Production worker configuration is manual.
    await db.query("update job_settings set value=$1 where key='cron_secret_hash'",[createHash("sha256").update(secret).digest("hex")]);
    return localRpc<T>(null,"care_worker",[secret,operation,payload]);
  }
  const { data,error } = await supabaseWorker().rpc("care_worker",{secret_:secret,operation_:operation,payload_:payload});
  if (error) throw new CareError(error.message,"worker",503);
  return data as T;
}
export async function processNotifications(local:boolean) {
  const items = await workerRpc<OutboxItem[]>(local,"claim",{limit:Number(process.env.NOTIFICATION_BATCH_SIZE || 30)});
  const result = {queued:items.length,sent:0,failed:0,unconfigured:0};
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  for (const item of items) {
    if (!resend) {
      await workerRpc(local,"finish",{id:item.id,status:"unconfigured",error:"RESEND_API_KEY is not configured. No email was sent."});
      result.unconfigured++; continue;
    }
    try {
      const {data,error} = await resend.emails.send({from:process.env.EMAIL_FROM || "CareRelay <onboarding@resend.dev>",to:item.email,subject:item.subject,html:emailHtml(item.subject,item.body),text:item.body},{idempotencyKey:item.idempotency_key});
      if(error) throw new Error(error.message);
      await workerRpc(local,"finish",{id:item.id,status:"sent",provider_id:data?.id});
      result.sent++;
    } catch(error) {
      await workerRpc(local,"finish",{id:item.id,status:"failed",error:(error as Error).message.slice(0,500)});
      result.failed++;
    }
  }
  return result;
}
export async function testReminder(user:User,profile:string) {
  const queued = await callCareRpc<Record<string,unknown>>(user,"care_test_reminder",{profile_:profile},[profile]);
  if (queued.error) throw new CareError(String(queued.error),"rate_limit",429);
  if (!process.env.CRON_SECRET) return {...queued,message:"Test recorded. Configure CRON_SECRET and RESEND_API_KEY to process delivery.",unconfigured:true};
  return {...queued,...await processNotifications(isLocalMode(user))};
}
export async function runReminderJob(local:boolean) {
  const collected = await workerRpc<{generated:number}>(local,"collect");
  return {...collected,...await processNotifications(local)};
}
export function verifyCronAuthorization(header:string | null) {
  const expected = process.env.CRON_SECRET;
  if(!expected || !header?.startsWith("Bearer ")) return false;
  const actual = header.slice(7);
  const a=Buffer.from(expected), b=Buffer.from(actual);
  return a.length===b.length && timingSafeEqual(a,b);
}
