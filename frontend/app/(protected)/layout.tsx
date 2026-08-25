import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Nav } from "@/components/layout/Nav";
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
      <div>
        <Nav role={session.role} username={session.username} />
        <main className="p-4">{children}</main>
      </div>
    </Providers>
  );
}
