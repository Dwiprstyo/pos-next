"use client";

import { Button } from "@/components/ui/button";

export default function KdsError({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 className="text-lg font-semibold">Papan dapur gagal dimuat</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Terjadi kesalahan saat memuat pesanan. Coba lagi untuk menyambung ulang.
      </p>
      <Button onClick={reset}>Coba lagi</Button>
    </div>
  );
}
