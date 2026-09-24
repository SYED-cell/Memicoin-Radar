import { AlertOctagon, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-3/70', className)} aria-hidden />;
}

export function LoadingState({ label = 'Loading market data…', rows = 6 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="card space-y-3 p-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <p className="flex items-center justify-center gap-2 text-xs text-muted">
        <Spinner /> {label}
      </p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-3 p-10 text-center">
      <AlertOctagon className="size-8 text-danger" aria-hidden />
      <div>
        <p className="font-semibold">Could not load data</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
      </div>
      <button className="btn btn-outline" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
