import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-line bg-surface-2 text-muted">
        <Icon className="size-6" aria-hidden />
      </div>
      <div>
        <p className="font-semibold text-fg">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
