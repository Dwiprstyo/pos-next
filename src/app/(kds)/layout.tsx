import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function KdsLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["kitchen", "manager"]);

  return <div className="min-h-svh bg-background text-foreground">{children}</div>;
}
