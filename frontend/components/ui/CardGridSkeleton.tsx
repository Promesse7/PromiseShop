import { Skeleton } from "./Skeleton";

interface CardGridSkeletonProps {
  label: string;
  count?: number;
}

export function CardGridSkeleton({ label, count = 8 }: CardGridSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 p-3 rounded-md border border-divider bg-surface h-[132px]">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2 mt-auto" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      ))}
    </div>
  );
}
