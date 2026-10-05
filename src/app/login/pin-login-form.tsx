"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { pinLogin, type PinLoginState } from "./actions";

type Outlet = { id: string; name: string };

export function PinLoginForm({ outlets }: { outlets: Outlet[] }) {
  const router = useRouter();
  const [outletId, setOutletId] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [pin, setPin] = useState("");
  const [state, formAction, pending] = useActionState<PinLoginState, FormData>(pinLogin, {});

  useEffect(() => {
    if (state.ok && state.redirectTo) {
      toast.success("Login berhasil");
      router.replace(state.redirectTo);
      router.refresh();
    }
  }, [state, router]);

  useEffect(() => {
    if (state.error) {
      setPin("");
      toast.error(state.error);
    }
  }, [state.error]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Login Staff</CardTitle>
        <CardDescription>Pilih outlet, masukkan kode staff, lalu PIN Anda.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="outlet">Outlet</Label>
            <Select
              value={outletId}
              onValueChange={(value) => setOutletId(value ?? "")}
              items={outlets.map((outlet) => ({ value: outlet.id, label: outlet.name }))}
            >
              <SelectTrigger id="outlet" className="w-full">
                <SelectValue placeholder="Pilih outlet" />
              </SelectTrigger>
              <SelectContent>
                {outlets.map((outlet) => (
                  <SelectItem key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="outletId" value={outletId} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="staffCode">Kode Staff</Label>
            <Input
              id="staffCode"
              name="staffCode"
              value={staffCode}
              onChange={(event) => setStaffCode(event.target.value.toUpperCase())}
              placeholder="cth. KSR1"
              autoComplete="username"
              autoCapitalize="characters"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              autoComplete="current-password"
              required
            />
            <p className="text-xs text-muted-foreground">
              Gunakan keyboard perangkat Anda (desktop/tablet).
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={pending || !outletId || staffCode.length === 0 || pin.length < 4}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Masuk"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
