"use client";

import {
  BarChart3,
  ChefHat,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Menu,
  MonitorSmartphone,
  Package,
  ReceiptText,
  Store,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { logout } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { AppRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ElementType; roles: AppRole[] };

const NAV_ITEMS: NavItem[] = [
  { href: "/pos", label: "Kasir", icon: MonitorSmartphone, roles: ["cashier", "manager"] },
  { href: "/pos/orders", label: "Pesanan", icon: ClipboardList, roles: ["cashier", "manager"] },
  { href: "/pos/tables", label: "Meja", icon: LayoutGrid, roles: ["cashier", "manager"] },
  { href: "/pos/shift", label: "Shift", icon: Wallet, roles: ["cashier", "manager"] },
  { href: "/kds", label: "KDS", icon: ChefHat, roles: ["kitchen", "manager"] },
  { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed, roles: ["manager"] },
  { href: "/admin/stock", label: "Stok", icon: Package, roles: ["manager"] },
  { href: "/admin/reports", label: "Laporan", icon: BarChart3, roles: ["manager"] },
  { href: "/admin/staff", label: "Staff", icon: Users, roles: ["manager"] },
  { href: "/admin/outlets", label: "Outlet", icon: Store, roles: ["manager"] },
];

const ROLE_LABEL: Record<AppRole, string> = {
  cashier: "Kasir",
  kitchen: "Dapur",
  manager: "Manager",
};

export function AppNav({
  role,
  fullName,
  outletName,
  isMultiOutlet,
}: {
  role: AppRole;
  fullName: string;
  outletName: string | null;
  isMultiOutlet: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role)).filter(
    (item) => !isMultiOutlet || item.href.startsWith("/admin"),
  );

  const links = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/pos" && pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ReceiptText className="size-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">POS &amp; KDS</p>
            <p className="text-xs text-muted-foreground">{outletName ?? "Semua outlet"}</p>
          </div>
        </div>
        {links}
        <div className="mt-auto space-y-3 pt-4">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="truncate text-sm font-medium">{fullName}</p>
            <Badge variant="secondary" className="mt-1">
              {ROLE_LABEL[role]}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <form action={logout} className="flex-1">
              <Button type="submit" variant="outline" className="w-full justify-start gap-2">
                <LogOut className="size-4" />
                Keluar
              </Button>
            </form>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className={buttonVariants({ variant: "outline", size: "icon" })}>
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetTitle className="mb-4">Menu</SheetTitle>
              {links}
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold">POS &amp; KDS</span>
        </div>
        <div className="flex items-center gap-2">
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon">
              <LogOut className="size-5" />
            </Button>
          </form>
          <ThemeToggle />
        </div>
      </header>
    </>
  );
}
