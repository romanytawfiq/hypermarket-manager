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

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-3">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg border bg-background p-4" />
        ))}
      </div>

      {/* Shift Summary */}
      <Skeleton className="h-48 rounded-lg border bg-background p-4" />

      {/* Sales Trend + Payment Breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-lg border bg-background p-4" />
        <Skeleton className="h-80 rounded-lg border bg-background p-4" />
      </div>

      {/* Top Products + Inventory Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-lg border bg-background p-4" />
        <Skeleton className="h-64 rounded-lg border bg-background p-4" />
      </div>

      {/* Financial Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-lg border bg-background p-4" />
        ))}
      </div>

      {/* Quick Actions */}
      <Skeleton className="h-48 rounded-lg border bg-background p-4" />
    </div>
  );
}