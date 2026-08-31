import { Skeleton } from "@/components/ui/skeleton";

export default function ExpensesLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="جارٍ تحميل المصروفات">
      <div className="grid gap-2 motion-reduce:animate-none">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="rounded-lg border bg-background p-4">
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
