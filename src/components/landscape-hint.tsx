import { Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";

export function LandscapeHint({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "hidden items-center justify-center gap-2 border-b bg-status-unpaid/15 px-3 py-2 text-center text-xs portrait:flex lg:hidden",
        className,
      )}
    >
      <Smartphone className="size-4 rotate-90" />
      <span>
        Putar perangkat ke posisi <strong>landscape</strong> untuk tampilan terbaik.
      </span>
    </div>
  );
}
