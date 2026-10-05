import { Store } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

import { PinLoginForm } from "./pin-login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const admin = createAdminClient();
  const { data: outlets } = await admin
    .from("outlets")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Store className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">POS &amp; KDS</h1>
        <p className="text-sm text-muted-foreground">Masuk dengan kode staff dan PIN</p>
      </div>

      <PinLoginForm outlets={outlets ?? []} />
    </main>
  );
}
