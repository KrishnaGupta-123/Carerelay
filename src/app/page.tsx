import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
export default async function Page(){redirect(await getUser()?"/dashboard":"/login");}
