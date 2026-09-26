import { AlertTriangle, Bell, ChevronRight, Info, MailOpen, Mail, OctagonAlert, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Alert, AlertSeverity, Token } from '../../types';
import { cn } from '../../utils/cn';
import { timeAgo } from '../../utils/format';
import { TokenAvatar } from '../ui/primitives';

export const SEVERITY_STYLE: Record<AlertSeverity, { icon: typeof Bell; cls: string; label: string }> = {
  critical: { icon: OctagonAlert, cls: 'text-danger bg-danger/12 border-danger/35', label: 'Critical' },
  warning: { icon: AlertTriangle, cls: 'text-warning bg-warning/12 border-warning/35', label: 'Warning' },
  info: { icon: Info, cls: 'text-accent bg-accent/12 border-accent/35', label: 'Info' },
};

interface AlertCardProps {
  alert: Alert;
  token?: Token;
  now: number;
  onToggleRead: () => void;
  onDelete: () => void;
}

export function AlertCard({ alert, token, now, onToggleRead, onDelete }: AlertCardProps) {
  const sev = SEVERITY_STYLE[alert.severity];
  const SevIcon = sev.icon;
  return (
    <li className={cn('group relative flex min-w-0 items-start gap-3 rounded-xl border p-3 transition sm:p-3.5', alert.read ? 'border-line bg-surface/60' : 'border-line-strong bg-surface-2/80')}>
      {!alert.read && <span className="absolute top-3.5 left-1 size-1.5 rounded-full bg-primary" aria-label="Unread" />}
      {token ? <TokenAvatar token={token} /> : <span className="grid size-9 place-items-center rounded-full bg-surface-3">🪙</span>}
      <Link to={`/alerts/${alert.id}`} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold">${alert.symbol}</span>
          <span className={cn('chip', sev.cls)}>
            <SevIcon className="size-3" aria-hidden />
            {sev.label}
          </span>
          {alert.category === 'new_token' && <span className="chip border-primary/40 bg-primary/10 text-primary">NEW</span>}
        </div>
        <p className={cn('mt-0.5 text-sm', alert.read ? 'text-muted' : 'text-fg')}>{alert.title}</p>
        <p className="line-clamp-2 text-xs break-words text-muted">
          {alert.message} · <time dateTime={new Date(alert.createdAt).toISOString()}>{timeAgo(alert.createdAt, now)}</time>
        </p>
      </Link>
      <div className="flex shrink-0 items-center gap-0.5">
        <button onClick={onToggleRead} className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-surface-3 hover:text-fg" aria-label={alert.read ? 'Mark as unread' : 'Mark as read'} title={alert.read ? 'Mark as unread' : 'Mark as read'}>
          {alert.read ? <Mail className="size-4" /> : <MailOpen className="size-4" />}
        </button>
        <button onClick={onDelete} className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-danger/10 hover:text-danger" aria-label="Delete alert" title="Delete alert">
          <Trash2 className="size-4" />
        </button>
        <Link to={`/alerts/${alert.id}`} className="hidden size-8 place-items-center rounded-lg text-subtle hover:text-fg sm:grid" aria-label="Open alert details">
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </li>
  );
}
