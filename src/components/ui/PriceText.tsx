import { cn } from '../../utils/cn';

/**
 * A figure whose decimals sit back a shade, so the eye lands on the part that matters:
 * $123,832.82 reads as "123,832" first. Used wherever a headline number appears.
 */
export function PriceText({ value, className, decimalsClassName }: { value: string; className?: string; decimalsClassName?: string }) {
  // Split on the last separator so thousands grouping is never mistaken for the decimal point.
  const match = /^(.*?)([.,]\d+)(\D*)$/.exec(value);
  if (!match) return <span className={cn('num', className)}>{value}</span>;
  const [, head, decimals, suffix] = match;
  return (
    <span className={cn('num', className)}>
      {head}
      <span className={cn('text-muted', decimalsClassName)}>{decimals}</span>
      {suffix}
    </span>
  );
}
