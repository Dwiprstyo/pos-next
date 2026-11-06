"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-[60svh] flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 className="text-lg font-semibold">Halaman gagal dimuat</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Terjadi kesalahan saat memuat data. Coba lagi atau kembali ke halaman sebelumnya.
      </p>
      <Button onClick={reset}>Coba lagi</Button>
    </div>
  );
}
