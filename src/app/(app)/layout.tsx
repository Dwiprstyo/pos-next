import { AppNav } from "@/components/app-nav";
import { requireRole } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["cashier", "manager"]);

  return (
    <div className="flex min-h-svh flex-col bg-muted/30 md:flex-row">
      <AppNav
        role={session.role}
        fullName={session.fullName}
        outletName={session.outletName}
        isMultiOutlet={session.isMultiOutlet}
      />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
