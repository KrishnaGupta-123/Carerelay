import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/server/auth";
import { loadCareData, mutateCare, CareError } from "@/server/care";
import { apiError, checkOrigin } from "@/server/http";
import { actionSchemas } from "@/lib/validation";
import { testReminder } from "@/server/notifications";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await getUser();
    if (!user) throw new CareError("Sign in to continue", "auth", 401);
    const profile = new URL(request.url).searchParams.get("profile") || undefined;
    if (profile) z.string().uuid().parse(profile);
    return NextResponse.json(await loadCareData(user, profile), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await getUser();
    if (!user) throw new CareError("Sign in to continue", "auth", 401);
    const body = z
      .object({ action: z.string(), profile: z.string().uuid().nullable(), payload: z.unknown() })
      .parse(await request.json());
    if (body.action === "test_reminder") {
      if (!body.profile) throw new CareError("Choose a care profile");
      return NextResponse.json(await testReminder(user, body.profile));
    }
    const schema = actionSchemas[body.action];
    if (!schema) throw new CareError("Unknown action");
    const result = await mutateCare(user, body.profile, body.action, schema.parse(body.payload));
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
