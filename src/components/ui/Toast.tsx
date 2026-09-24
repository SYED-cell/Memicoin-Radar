import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ToastMessage } from '../../types';
import { cn } from '../../utils/cn';

const STYLES = {
  success: { icon: CheckCircle2, cls: 'text-primary border-primary/30' },
  error: { icon: XCircle, cls: 'text-danger border-danger/30' },
  warning: { icon: AlertTriangle, cls: 'text-warning border-warning/30' },
  info: { icon: Info, cls: 'text-accent border-accent/30' },
} as const;

export function ToastViewport({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 md:top-auto md:right-4 md:bottom-4 md:left-auto md:items-end"
    >
      {toasts.map((t) => {
        const { icon: Icon, cls } = STYLES[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border bg-surface-2/95 p-3.5 shadow-2xl backdrop-blur',
              cls,
            )}
          >
            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs break-words whitespace-pre-line text-muted">{t.description}</p>}
            </div>
            <button onClick={() => onDismiss(t.id)} className="rounded-md p-1 text-muted hover:bg-surface-3 hover:text-fg" aria-label="Dismiss notification">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
