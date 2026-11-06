export default function KdsLoading() {
  return (
    <div className="flex h-svh flex-col" role="status" aria-live="polite">
      <span className="sr-only">Memuat papan dapur...</span>
      <div className="h-16 animate-pulse border-b bg-muted/40 motion-reduce:animate-none" />
      <div className="grid flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-full animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
