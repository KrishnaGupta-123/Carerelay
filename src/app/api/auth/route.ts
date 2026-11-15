import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { Resend } from "resend";
import { supabaseServer } from "@/server/supabase";
import {
  localAuthAllowed,
  isLocalMode,
  localDb,
  localLogin,
  createLocalUser,
  createLocalSession,
  hashToken,
  passwordHash,
} from "@/server/local-db";
import { CareError } from "@/server/care";
import { checkOrigin, apiError } from "@/server/http";
const schema = z.object({
  action: z.enum(["login", "signup", "logout", "forgot", "reset"]),
  email: z.email().optional(),
  password: z.string().min(8).max(128).optional(),
  name: z.string().trim().min(1).max(150).optional(),
  mode: z.enum(["local", "supabase"]).optional(),
  token: z.string().optional(),
});
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = schema.parse(await request.json());
    const jar = await cookies();
    if (body.action === "logout") {
      const token = jar.get("care_session")?.value;
      if (token && localAuthAllowed())
        await (
          await localDb()
        ).query("delete from local_sessions where token_hash=$1", [hashToken(token)]);
      jar.delete("care_session");
      jar.delete("care_profile");
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) await (await supabaseServer()).auth.signOut();
      return NextResponse.json({ message: "Signed out" });
    }
    const local = body.mode === "local" ? localAuthAllowed() : isLocalMode();
    if (body.mode === "local" && !localAuthAllowed())
      throw new CareError("Local authentication is disabled", "auth", 403);
    if (local) {
      const db = await localDb();
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "localhost";
      const limit = await db.query<{ allowed: boolean }>(
        "select consume_rate_limit($1,15,900) as allowed",
        [`auth:${hashToken(ip)}:${body.action}`],
      );
      if (!limit.rows[0].allowed)
        throw new CareError("Too many attempts. Try again in 15 minutes.", "rate_limit", 429);
      if (body.action === "login" || body.action === "signup") {
        if (!body.email || !body.password) throw new CareError("Enter an email and password");
        let user;
        try {
          user =
            body.action === "signup"
              ? await createLocalUser(
                  body.email,
                  body.name || body.email.split("@")[0],
                  body.password,
                )
              : await localLogin(body.email, body.password);
        } catch (error) {
          throw new CareError((error as Error).message, "auth", 400);
        }
        const token = await createLocalSession(user.id);
        jar.set("care_session", token, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 7 * 86400,
        });
        jar.delete("care_profile");
        return NextResponse.json({ message: "Signed in", redirect: "/dashboard" });
      }
      if (body.action === "forgot") {
        if (!body.email) throw new CareError("Enter your email");
        if (!process.env.RESEND_API_KEY)
          throw new CareError(
            "Password reset email requires RESEND_API_KEY. Configure email delivery, or use your existing local demo password.",
            "configuration",
            503,
          );
        const u = await db.query<{ id: string }>(
          "select id from users where lower(email)=lower($1)",
          [body.email],
        );
        if (u.rows[0]) {
          const token = randomBytes(32).toString("base64url");
          await db.query(
            "insert into local_reset_tokens(token_hash,user_id,expires_at) values($1,$2,now()+interval '30 minutes')",
            [hashToken(token), u.rows[0].id],
          );
          const link = `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/reset-password?token=${token}&mode=local`;
          const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
            from: process.env.EMAIL_FROM || "CareRelay <onboarding@resend.dev>",
            to: body.email,
            subject: "Reset your CareRelay password",
            text: `Open this single-use link to reset your password. It expires in 30 minutes.\n\n${link}\n\nIf you did not request this, ignore this email.`,
          });
          if (error)
            throw new CareError(
              "Password reset email could not be delivered. Check the sending-domain configuration.",
              "email",
              503,
            );
        }
        return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
      }
      if (body.action === "reset") {
        if (!body.token || !body.password)
          throw new CareError("Enter a new password and use a valid reset link");
        await db.transaction(async (tx) => {
          const r = await tx.query<{ user_id: string }>(
            "select user_id from local_reset_tokens where token_hash=$1 and expires_at>now() and consumed_at is null for update",
            [hashToken(body.token!)],
          );
          if (!r.rows[0]) throw new CareError("This reset link is invalid or expired");
          await tx.query("update local_credentials set password_hash=$1 where user_id=$2", [
            passwordHash(body.password!),
            r.rows[0].user_id,
          ]);
          await tx.query("update local_reset_tokens set consumed_at=now() where token_hash=$1", [
            hashToken(body.token!),
          ]);
          await tx.query("delete from local_sessions where user_id=$1", [r.rows[0].user_id]);
        });
        return NextResponse.json({
          message: "Password updated. Sign in with your new password.",
          redirect: "/login?mode=local",
        });
      }
    } else {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
        throw new CareError("Configure Supabase before signing in", "configuration", 503);
      const client = await supabaseServer();
      if (body.action === "login") {
        const { error } = await client.auth.signInWithPassword({
          email: body.email!,
          password: body.password!,
        });
        if (error) throw new CareError(error.message, "auth", 400);
        jar.delete("care_session");
        jar.delete("care_profile");
        return NextResponse.json({ redirect: "/dashboard" });
      }
      if (body.action === "signup") {
        const { data, error } = await client.auth.signUp({
          email: body.email!,
          password: body.password!,
          options: {
            data: { name: body.name },
            emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/auth/callback`,
          },
        });
        if (error) throw new CareError(error.message, "auth", 400);
        jar.delete("care_session");
        return NextResponse.json(
          data.session
            ? { redirect: "/dashboard" }
            : { message: "Check your email to confirm your account, then sign in." },
        );
      }
      if (body.action === "forgot") {
        const { error } = await client.auth.resetPasswordForEmail(body.email!, {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/auth/callback?next=/reset-password`,
        });
        if (error) throw new CareError(error.message, "auth", 400);
        return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
      }
      if (body.action === "reset") {
        const { error } = await client.auth.updateUser({ password: body.password });
        if (error) throw new CareError(error.message, "auth", 400);
        return NextResponse.json({ message: "Password updated", redirect: "/dashboard" });
      }
    }
    throw new CareError("Invalid authentication action");
  } catch (error) {
    return apiError(error);
  }
}
