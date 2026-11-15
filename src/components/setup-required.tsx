"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Database, ArrowRight } from "lucide-react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
export function SetupRequired({ message }: { message: string }) {
  const router = useRouter();
  return (
    <main id="main-content" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center p-8">
      <Brand />
      <div className="mt-10">
        <Database className="text-primary" size={32} />
        <h1 className="mb-3 mt-5 text-3xl font-semibold tracking-tight">Connect your care space</h1>
        <p className="text-sm leading-7 text-muted-foreground">{message}</p>
        <ol className="my-7 space-y-4 text-sm leading-7">
          <li>
            1. Open your Supabase project → <strong>SQL Editor</strong>.
          </li>
          <li>
            2. Copy and run <code className="rounded bg-white p-1">scripts/setup-supabase.sql</code>{" "}
            from this project.
          </li>
          <li>
            3. In Supabase Auth, add your app URL and <code>/auth/callback</code> to allowed
            redirect URLs.
          </li>
          <li>4. Return here and reload. Your account stays signed in.</li>
        </ol>
        <Button onClick={() => window.location.reload()}>
          Check connection <ArrowRight size={15} />
        </Button>
        <div className="mt-6 flex gap-5 text-xs">
          <Link className="font-semibold text-primary" href="/login?mode=local">
            Explore the local demo
          </Link>
          <button
            className="text-muted-foreground"
            onClick={async () => {
              await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "logout" }),
              });
              router.push("/login");
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
