import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["manager"]);

  if (!session.outletId && !session.isMultiOutlet) {
    redirect("/login");
  }

  return <div className="p-4">{children}</div>;
}
