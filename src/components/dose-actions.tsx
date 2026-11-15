"use client";
import { useState } from "react";
import { Check,HelpCircle,MoreHorizontal } from "lucide-react";
import type { Dose,DoseStatus } from "@/lib/types";
import { useCare } from "./care-provider";
import { Button } from "./ui/button";
import { Dialog,DialogContent,DialogTitle,DialogDescription } from "./ui/dialog";
import { Field,Textarea,Select } from "./ui/fields";
export function DoseActions({dose,large=false}:{dose:Dose;large?:boolean}) {
  const {data,act,busy}=useCare();const [open,setOpen]=useState(false);const [status,setStatus]=useState<DoseStatus>("unconfirmed");
  const role=data.membership?.role;const allowed=role==="owner" || role==="coordinator" || (role==="caretaker" && data.membership?.id===dose.assigned_member_id);
  if(!allowed) return null;
  const save=async(s:DoseStatus,note="")=>{try{await act("dose_status",{id:dose.id,expected_version:dose.version,status:s,note});setOpen(false);}catch{}};
  const done=["self_reported_taken","assisted_recorded","declined","explicitly_missed"].includes(dose.status);
  return <><div className={`flex flex-wrap items-center gap-2 ${large?"mt-5":""}`}>
    {!done && <><Button variant={large?"default":"secondary"} size={large?"lg":"sm"} disabled={busy} onClick={()=>save(role==="owner"?"self_reported_taken":"assisted_recorded")}><Check size={large?19:12}/>{role==="owner"?"Taken":"Record assistance"}</Button><Button variant="outline" size={large?"lg":"sm"} disabled={busy} onClick={()=>{setStatus("needs_help");setOpen(true);}}><HelpCircle size={large?18:12}/>{large?"Need help":"Help"}</Button>{large && <><Button size="lg" variant="outline" disabled={busy} onClick={()=>save("unconfirmed")}>Not sure</Button><Button size="lg" variant="outline" disabled={busy} onClick={()=>{setStatus("declined");setOpen(true);}}>Declined</Button></>}</>}
    <Button variant="ghost" size={large?"default":"icon"} className={large?"":"size-7"} aria-label="More dose reporting options" disabled={busy} onClick={()=>{setStatus(dose.status==="scheduled"?"unconfirmed":dose.status);setOpen(true);}}>{large?"Update report":<MoreHorizontal size={15}/>}</Button>
  </div><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Record a dose status</DialogTitle><DialogDescription>{dose.snapshot.name} · {dose.snapshot.strength}. Record what was reported. An unconfirmed status does not mean the dose was missed.</DialogDescription><form className="space-y-5" onSubmit={async e=>{e.preventDefault();await save(status,String(new FormData(e.currentTarget).get("note") || ""));}}><Field label="Reported status"><Select value={status} onChange={e=>setStatus(e.target.value as DoseStatus)}>{role==="owner"?<option value="self_reported_taken">I report that I took it</option>:<option value="assisted_recorded">I assisted and recorded the report</option>}<option value="needs_help">Needs help</option><option value="unconfirmed">Not sure / unconfirmed</option><option value="declined">Declined</option><option value="explicitly_missed">Explicitly reported as missed</option></Select></Field><Field label="Note (optional)"><Textarea name="note" placeholder="Add helpful context to this report."/></Field>{status==="explicitly_missed" && <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">Only choose this when the dose is explicitly reported as missed. A lack of updates is unconfirmed.</p>}<Button type="submit" disabled={busy} className="w-full">Save dose report</Button></form></DialogContent></Dialog></>;
}
