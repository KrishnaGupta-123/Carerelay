import { NextResponse } from "next/server";
import { runReminderJob, verifyCronAuthorization } from "@/server/notifications";
import { isLocalMode } from "@/server/local-db";
import { apiError } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!verifyCronAuthorization(request.headers.get("authorization")))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runReminderJob(isLocalMode()));
  } catch (error) {
    return apiError(error);
  }
}
