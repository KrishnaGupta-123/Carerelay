import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getUser } from "@/server/auth";
import { CareError, loadCareData } from "@/server/care";
import { apiError, checkOrigin } from "@/server/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await getUser();
    if (!user) throw new CareError("Sign in to continue", "auth", 401);
    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());
    await loadCareData(user, id);
    (await cookies()).set("care_profile", id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
