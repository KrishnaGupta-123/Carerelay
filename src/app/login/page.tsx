import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { localAuthAllowed } from "@/server/local-db";
export default function Page(){return <Suspense><AuthForm page="login" localEnabled={localAuthAllowed()} supabaseConfigured={!!process.env.NEXT_PUBLIC_SUPABASE_URL}/></Suspense>;}
