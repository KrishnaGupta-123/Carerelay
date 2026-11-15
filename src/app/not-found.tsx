import Link from "next/link";
import { HeartHandshake } from "lucide-react";
export default function NotFound() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-8 text-center"
    >
      <HeartHandshake size={40} className="text-primary" />
      <h1 className="mt-5 text-2xl font-semibold">Let’s get you back to your care space.</h1>
      <p className="my-4 text-sm text-muted-foreground">This page could not be found.</p>
      <Link
        className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white"
        href="/dashboard"
      >
        Go to overview
      </Link>
    </main>
  );
}
