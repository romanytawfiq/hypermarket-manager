import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading fallback for the dashboard.
 *
 * Shown in the AppShell content area while the requested segment's server
 * component (and its data loads) streams in on navigation. It is a lightweight,
 * non-blocking skeleton — never a fake delay or a full-page spinner. Animation
 * is disabled for users who prefer reduced motion.
 */
export default function DashboardLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="جارٍ تحميل الصفحة">
      <div className="grid gap-2 motion-reduce:animate-none">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="rounded-lg border bg-background p-4">
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
