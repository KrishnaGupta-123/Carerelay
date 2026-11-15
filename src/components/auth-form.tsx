"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter,useSearchParams } from "next/navigation";
import { ArrowRight,ArrowLeft,CheckCircle2,Eye,EyeOff,LockKeyhole,HeartHandshake,ShieldCheck,Sprout } from "lucide-react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { Input,Field } from "./ui/fields";
type Page="login"|"signup"|"forgot"|"reset";
export function AuthForm({page,localEnabled,supabaseConfigured}:{page:Page;localEnabled:boolean;supabaseConfigured:boolean}) {
  const search=useSearchParams();const router=useRouter();
  const [mode,setMode]=useState<"supabase"|"local">(search.get("mode")==="local" || !supabaseConfigured ? "local":"supabase");
  const [busy,setBusy]=useState(false);const [error,setError]=useState(search.get("error") || "");const [message,setMessage]=useState("");const [show,setShow]=useState(false);
  const title={login:"A little clarity. A lot of care.",signup:"Good care starts together.",forgot:"Let’s get you back in.",reset:"A fresh start, securely."}[page];
  const handle=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setError("");setMessage("");setBusy(true);
    const form=new FormData(e.currentTarget);
    try {
      const res=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:page==="reset" ? "reset":page,email:form.get("email") || undefined,password:form.get("password") || undefined,name:form.get("name") || undefined,mode,token:search.get("token") || undefined})});
      const data=await res.json();if(!res.ok) throw new Error(data.error);
      if(data.redirect) {router.push(data.redirect);router.refresh();} else setMessage(data.message);
    } catch(error) {setError((error as Error).message);} finally {setBusy(false);}
  };
  return <div className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
    <div className="relative hidden overflow-hidden bg-[#eaf1ec] px-14 py-10 lg:flex lg:flex-col"><Brand/><div className="relative z-10 my-auto max-w-md py-20"><span className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/60 px-3 py-1.5 text-[11px] font-semibold text-primary"><Sprout size={13}/> A shared space for the people you love</span><h1 className="text-[52px] font-semibold leading-[1.16] tracking-[-2px]">Care feels better<br/>when it’s <span className="text-primary">shared.</span></h1><p className="mt-6 max-w-sm text-base leading-8 text-[#708078]">Stay in sync with medication routines, everyday responsibilities, and the people who make a difference.</p><div className="mt-10 space-y-5">{[[HeartHandshake,"Clear handoffs","Know who is helping, and when."],[ShieldCheck,"Your circle, your choice","Share care with people you authorise."],[CheckCircle2,"One reassuring place","Keep everyone on the same page."]].map(([Icon,t,d])=>{const I=Icon as typeof HeartHandshake;return <div key={String(t)} className="flex items-center gap-4"><span className="grid size-10 place-items-center rounded-xl bg-white/80 text-primary"><I size={20}/></span><div><div className="text-sm font-semibold">{String(t)}</div><div className="mt-0.5 text-xs text-muted-foreground">{String(d)}</div></div></div>;})}</div></div><p className="text-xs text-[#7b8f82]">Shared care. Clear responsibilities. Better coordination.</p><div aria-hidden="true" className="absolute -bottom-56 -right-52 size-[600px] rounded-full border-[80px] border-white/30"/><div aria-hidden="true" className="absolute -right-64 top-0 size-[550px] rounded-full border border-primary/8"/></div>
    <main id="main-content" className="flex min-h-dvh flex-col bg-white px-6 py-8 lg:px-16"><div className="lg:hidden"><Brand/></div><div className="ml-auto text-xs text-muted-foreground">{page==="login"?<>New here? <Link className="ml-2 font-semibold text-primary" href="/signup">Create an account</Link></>:<Link href="/login" className="inline-flex items-center gap-2 font-semibold text-primary"><ArrowLeft size={13}/> Back to sign in</Link>}</div><div className="mx-auto my-auto w-full max-w-[390px] py-14"><span className="mb-5 inline-grid size-11 place-items-center rounded-xl border border-border text-primary"><LockKeyhole size={21}/></span><h2 className="text-[29px] font-semibold leading-10 tracking-[-1px]">{title}</h2><p className="mb-8 mt-2 text-sm leading-6 text-muted-foreground">{page==="login"?"Welcome back. Your care circle is right here.":page==="signup"?"Create your own account, then start or join a care circle.":page==="forgot"?"We’ll email you a secure link to reset your password.":"Choose a strong password for your CareRelay account."}</p>
      {localEnabled && page!=="reset" && <div className="mb-6 grid grid-cols-2 rounded-lg bg-muted p-1"><button onClick={()=>setMode("supabase")} disabled={!supabaseConfigured} className={`rounded-md py-2 text-xs font-semibold transition ${mode==="supabase"?"bg-white text-primary shadow-sm":"text-muted-foreground"}`}>CareRelay account</button><button onClick={()=>setMode("local")} className={`rounded-md py-2 text-xs font-semibold transition ${mode==="local"?"bg-white text-primary shadow-sm":"text-muted-foreground"}`}>Local demo account</button></div>}
      {mode==="local" && <p className="mb-5 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs leading-5 text-amber-800">Development demo · fictional care data, individual accounts, persistent local storage.</p>}
      {message?<div role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm leading-7 text-primary"><CheckCircle2 size={23} className="mb-3"/>{message}</div>:<form onSubmit={handle} className="space-y-5">
        {page==="signup" && <Field label="Your name" required><Input name="name" placeholder="How should we call you?" autoComplete="name" required/></Field>}
        {page!=="reset" && <Field label="Email address" required><Input name="email" type="email" placeholder={mode==="local"?"ananya@carerelay.demo":"you@example.com"} autoComplete="email" required/></Field>}
        {page!=="forgot" && <Field label={page==="reset"?"New password":"Password"} required><span className="relative block"><Input name="password" type={show?"text":"password"} placeholder="At least 8 characters" autoComplete={page==="login"?"current-password":"new-password"} minLength={8} required className="pr-11"/><button type="button" onClick={()=>setShow(!show)} aria-label={show?"Hide password":"Show password"} className="absolute right-3 top-3 text-muted-foreground">{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></span></Field>}
        {page==="login" && <div className="flex justify-end"><Link href={`/forgot-password?mode=${mode}`} className="text-xs font-semibold text-primary">Forgot password?</Link></div>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-700">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={busy}>{busy?"Please wait…":page==="login"?"Sign in":page==="signup"?"Create account":page==="forgot"?"Send reset link":"Save new password"}<ArrowRight size={17}/></Button>
      </form>}
      {page==="login" && <p className="mt-7 text-center text-xs text-muted-foreground">Have an invitation code? <Link href="/signup" className="font-semibold text-primary">Create an account to join</Link></p>}
    </div><p className="mx-auto max-w-sm text-center text-[11px] leading-5 text-muted-foreground">CareRelay supports coordination and recorded reports.<br/>Always consult your healthcare professional for medical decisions.</p></main>
  </div>;
}
