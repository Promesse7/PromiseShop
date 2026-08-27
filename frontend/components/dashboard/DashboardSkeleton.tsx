import { Skeleton } from "@/components/ui/Skeleton";

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard…">
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-md" />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 p-3 rounded-md border border-divider bg-surface h-[130px]">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-3 w-1/3 mt-auto" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1.5fr_1fr] gap-4 mb-4">
        <Skeleton className="h-[260px] rounded-md" />
        <Skeleton className="h-[260px] rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-[220px] rounded-md" />
        <Skeleton className="h-[220px] rounded-md" />
      </div>
    </div>
  );
}
