import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CareError } from "./care";
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const expected = url.origin;
  const publicRequestOrigin = request.headers.get("host")
    ? `${url.protocol}//${request.headers.get("host")}`
    : expected;
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || (origin !== expected && origin !== publicRequestOrigin && origin !== configured))
    throw new CareError("Request origin is not allowed", "origin", 403);
}
export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues.map((i) => i.message).join(". ") },
      { status: 400 },
    );
  if (error instanceof CareError)
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  const e = error as Error;
  console.error("CareRelay request failed:", e.message);
  return NextResponse.json(
    { error: "We could not complete this action. Please try again." },
    { status: 500 },
  );
}
