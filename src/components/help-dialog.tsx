"use client";
import { Dialog,DialogContent,DialogTitle,DialogDescription } from "./ui/dialog";
import { Textarea,Field } from "./ui/fields";
import { Button } from "./ui/button";
import { useCare } from "./care-provider";
export function HelpDialog({open,onOpenChange}:{open:boolean;onOpenChange:(v:boolean)=>void}) {
  const {act,busy}=useCare();return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogTitle>Ask your care circle for help</DialogTitle><DialogDescription>Tell your authorised care circle what you need. This creates a care task and notifies the owner and coordinator according to their preferences.</DialogDescription><form className="space-y-5" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await act("request_help",{note:f.get("note")});onOpenChange(false);}catch{}}}><Field label="How can we help?" required><Textarea required name="note" placeholder="I would like someone to help with…"/></Field><p className="text-xs leading-6 text-muted-foreground">For urgent medical help, contact local emergency services or your healthcare professional. Care circle notifications may not be read immediately.</p><Button type="submit" className="w-full" disabled={busy}>Request support</Button></form></DialogContent></Dialog>;
}
