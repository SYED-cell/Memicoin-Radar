import { ChevronRight, Crosshair } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * The one promotional surface in the app: a lit card offering what Pro adds. Hidden once the
 * account has it, so a paying user never sees an advert for something they already bought.
 */
export function ProBanner() {
  const { user } = useAuth();
  if ((user?.proUntil ?? 0) > Date.now()) return null;

  return (
    <Link
      to="/pro"
      className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-primary/25 p-4 transition active:scale-[0.99]"
      style={{ background: 'linear-gradient(110deg, rgb(34 224 122 / 0.22), rgb(34 224 122 / 0.06) 55%, transparent)' }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold">Unlock entry levels</p>
        <p className="mt-0.5 text-xs text-muted">Both entries with their split, stop and targets — plus Telegram buy signals.</p>
        <span className="mt-2 inline-flex items-center gap-0.5 text-sm font-semibold text-primary">
          Get Pro <ChevronRight className="size-4" />
        </span>
      </div>
      {/* Stands in for the reference's 3D badge: same visual weight, no asset to ship. */}
      <span className="relative grid size-16 shrink-0 place-items-center rounded-2xl bg-primary/15 ring-1 ring-primary/30" aria-hidden>
        <Crosshair className="size-8 text-primary" />
      </span>
    </Link>
  );
}
