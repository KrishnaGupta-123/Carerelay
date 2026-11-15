"use client";
import { createContext,useContext,useState,useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CareData } from "@/lib/types";
interface Context { data:CareData; busy:boolean; refresh:()=>Promise<void>; act:(action:string,payload:unknown,options?:{silent?:boolean})=>Promise<Record<string,unknown>>; switchProfile:(id:string)=>Promise<void>; }
const CareContext=createContext<Context | null>(null);
export function CareProvider({initial,children}:{initial:CareData;children:React.ReactNode}) {
  const [data,setData]=useState(initial);const [busy,setBusy]=useState(false);const router=useRouter();
  const refresh=useCallback(async()=>{
    const res=await fetch(`/api/care${data.profile?`?profile=${data.profile.id}`:""}`,{cache:"no-store"});
    const next=await res.json();if(!res.ok) throw new Error(next.error);setData(next);
  },[data.profile]);
  const act=useCallback(async(action:string,payload:unknown,options?:{silent?:boolean})=>{
    setBusy(true);
    try {
      const res=await fetch("/api/care",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,profile:data.profile?.id || null,payload})});
      const result=await res.json();if(!res.ok) {if(res.status===409) await refresh();throw new Error(result.error);}
      if(!options?.silent) toast.success(result.message || "Saved");
      if(action==="create_profile" || action==="join") {
        await fetch("/api/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:result.id})});
        const fresh=await fetch(`/api/care?profile=${result.id}`,{cache:"no-store"});setData(await fresh.json());router.refresh();
      } else await refresh();
      return result;
    } catch(error) {toast.error((error as Error).message);throw error;} finally {setBusy(false);}
  },[data.profile,refresh,router]);
  const switchProfile=async(id:string)=>{
    const res=await fetch("/api/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});
    if(!res.ok) {toast.error((await res.json()).error);return;}
    const next=await fetch(`/api/care?profile=${id}`,{cache:"no-store"});setData(await next.json());router.refresh();
  };
  return <CareContext.Provider value={{data,busy,refresh,act,switchProfile}}>{children}</CareContext.Provider>;
}
export function useCare() {const context=useContext(CareContext);if(!context) throw new Error("CareProvider is required");return context;}
