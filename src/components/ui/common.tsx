import { cn,initials,statusLabels } from "@/lib/utils";
import type { DoseStatus } from "@/lib/types";
import { Check,Clock,HelpCircle,AlertCircle } from "lucide-react";
export function Avatar({name,className,tone=0}:{name:string;className?:string;tone?:number}) {return <span aria-label={name} className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-2 ring-white",["bg-[#e5eeec] text-[#3f7067]","bg-[#ece8f5] text-[#8066a2]","bg-[#f6eadf] text-[#ad8058]","bg-[#e4edf8] text-[#6786ad]"][tone%4],className)}>{initials(name)}</span>;}
export function Badge({children,tone="neutral",className}:{children:React.ReactNode;tone?:"green"|"amber"|"red"|"neutral"|"blue";className?:string}) {return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",{green:"bg-[#eaf5ef] text-[#27815d]",amber:"bg-[#fff4dc] text-[#a37a29]",red:"bg-[#fff0ed] text-[#c2715e]",neutral:"bg-[#f0f2f2] text-[#73817e]",blue:"bg-[#edf1fa] text-[#687daa]"}[tone],className)}>{children}</span>;}
export function StatusBadge({status}:{status:DoseStatus}) {
  const done=status==="self_reported_taken" || status==="assisted_recorded";
  const tone=done ? "green" : status==="unconfirmed" || status==="needs_help" ? "amber" : status==="explicitly_missed" ? "red" : "neutral";
  const Icon=done ? Check : status==="needs_help" ? HelpCircle : status==="unconfirmed" || status==="explicitly_missed" ? AlertCircle : Clock;
  return <Badge tone={tone}><Icon size={11}/>{statusLabels[status]}</Badge>;
}
export function EmptyState({icon:Icon,title,description,action}:{icon:React.ComponentType<{size?:number;className?:string}>;title:string;description:string;action?:React.ReactNode}) {return <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/7 text-primary"><Icon size={25}/></div><h3 className="font-semibold">{title}</h3><p className="mb-5 mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{action}</div>;}
export function Card({className,...props}:React.HTMLAttributes<HTMLDivElement>) {return <div className={cn("rounded-xl border border-border bg-white shadow-[0_2px_4px_-3px_rgba(20,50,40,0.08)]",className)} {...props}/>;}
