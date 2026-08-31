import { Skeleton } from "@/components/ui/skeleton";

export default function AccountingLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="جارٍ تحميل المحاسبة">
      <div className="grid gap-2 motion-reduce:animate-none">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    </div>
  );
}
