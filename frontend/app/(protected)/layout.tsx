import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";
import { Providers } from "@/components/layout/Providers";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <Providers>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(600px_circle_at_15%_-10%,rgba(108,92,214,0.10),transparent_60%),radial-gradient(500px_circle_at_100%_0%,rgba(108,92,214,0.07),transparent_55%)]"
      />
      <AppShell role={session.role} username={session.username}>
        {children}
      </AppShell>
    </Providers>
  );
}
