import { cookies } from "next/headers";
import { requireUser } from "@/server/auth";
import { loadCareData, CareError } from "@/server/care";
import { CareProvider } from "@/components/care-provider";
import { AppShell } from "@/components/app-shell";
import { SetupRequired } from "@/components/setup-required";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const profile = (await cookies()).get("care_profile")?.value;
  let data;
  try {
    data = await loadCareData(user, profile);
  } catch (error) {
    if (profile && error instanceof CareError && error.status === 403)
      data = await loadCareData(user);
    else return <SetupRequired message={(error as Error).message} />;
  }
  return (
    <CareProvider initial={data}>
      <AppShell>{children}</AppShell>
    </CareProvider>
  );
}
