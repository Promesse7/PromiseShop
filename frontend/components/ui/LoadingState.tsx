import { Skeleton } from "./Skeleton";

type LoadingVariant = "table" | "cards" | "detail" | "form";

interface LoadingStateProps {
  /** The shape of what is loading, so the page doesn't jump when it arrives. */
  variant: LoadingVariant;
  /** Rows (table) or cards (cards) to draw. */
  rows?: number;
  label?: string;
}

/** A skeleton shaped like the content that is about to appear. */
export function LoadingState({ variant, rows, label = "Loading…" }: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true" aria-label={label} data-variant={variant}>
      {variant === "table" && <TableSkeleton rows={rows ?? 6} />}
      {variant === "cards" && <CardsSkeleton count={rows ?? 8} />}
      {variant === "detail" && <DetailSkeleton />}
      {variant === "form" && <FormSkeleton />}
    </div>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} data-testid="loading-row" className="h-11 w-full" />
      ))}
    </div>
  );
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-lg" />
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
