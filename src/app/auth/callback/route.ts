import { NextResponse } from "next/server";
import { supabaseServer } from "@/server/supabase";
export async function GET(request:Request) {
  const url=new URL(request.url);const code=url.searchParams.get("code");
  const next=url.searchParams.get("next")==="/reset-password" ? "/reset-password" : "/dashboard";
  if(code) {
    const {error}=await (await supabaseServer()).auth.exchangeCodeForSession(code);
    if(!error) return NextResponse.redirect(new URL(next,url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=The+email+link+is+invalid+or+expired",url.origin));
}
