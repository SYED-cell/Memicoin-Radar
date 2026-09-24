import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface VirtualListProps<T> {
  items: T[];
  rowHeight: number;
  /** CSS height of the scroll viewport. */
  height: CSSProperties['height'];
  overscan?: number;
  getKey: (item: T) => string;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
  header?: ReactNode;
  ariaLabel?: string;
}

/**
 * Fixed-row-height windowed list: only rows in (or near) the viewport are mounted, so feeds with
 * hundreds of live-updating tokens stay smooth on low-end phones.
 */
export function VirtualList<T>({ items, rowHeight, height, overscan = 6, getKey, renderRow, className, header, ariaLabel }: VirtualListProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport(el.clientHeight));
    ro.observe(el);
    setViewport(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);
  const visible = items.slice(start, end);

  return (
    <div
      ref={ref}
      role="list"
      aria-label={ariaLabel}
      style={{ height }}
      className={cn('relative overflow-y-auto overscroll-contain', className)}
      onScroll={(e) => setScrollTop(Math.max(0, e.currentTarget.scrollTop - (headerRef.current?.offsetHeight ?? 0)))}
    >
      {header && (
        <div ref={headerRef} className="sticky top-0 z-10">
          {header}
        </div>
      )}
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {visible.map((item, i) => (
          <div key={getKey(item)} role="listitem" style={{ position: 'absolute', top: (start + i) * rowHeight, left: 0, right: 0, height: rowHeight }}>
            {renderRow(item, start + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
