import { memo } from "react";
import { LuMinus, LuPlus, LuX } from "react-icons/lu";
import { formatMoney } from "../../lib/format";
import { fromPaise } from "../../lib/pricing";

/*
 * Deliberately has no thumbnail. You just put this item on the bill, so the picture tells you
 * nothing you don't know, and dropping it buys ~56px of width and halves the row height —
 * a 20-item bill now fits on screen instead of scrolling.
 */
export const CartLine = memo(function CartLine({
  line,
  computed,
  currency,
  highlight,
  onIncrement,
  onDecrement,
  onRemove,
}) {
  const amount = fromPaise(computed.lineSubtotal - computed.lineDiscount);

  return (
    <li
      className={`flex items-center gap-2 border-b border-surface-line/70 px-3 py-2 last:border-b-0 ${
        highlight ? "animate-flash" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-body font-bold leading-5 text-ink">
          {line.name}
        </p>
        <p className="truncate text-desc text-ink-muted tabular">
          {formatMoney(line.unitPrice, currency)}/{line.unit}
          {line.discountPercent > 0 ? (
            <span className="ml-1 font-semibold text-brand-800">
              {line.discountPercent}% off
            </span>
          ) : null}
        </p>
      </div>

      {line.soldByWeight ? (
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-lg bg-surface-sunk px-2 py-1.5 text-body font-bold text-ink-soft tabular">
            {line.quantity.toFixed(3)} {line.unit}
          </span>
          <button
            type="button"
            onClick={() => onRemove(line.lineId)}
            className="grid h-tap w-10 place-items-center rounded-lg text-ink-faint transition hover:bg-stock-outBg hover:text-stock-out"
            aria-label={`Remove ${line.name}`}
          >
            <LuX size={18} aria-hidden />
          </button>
        </div>
      ) : (
        <div
          className="flex shrink-0 items-center gap-1"
          role="group"
          aria-label={`Quantity of ${line.name}`}
        >
          <button
            type="button"
            onClick={() => onDecrement(line)}
            className="grid h-tap w-tap place-items-center rounded-lg border border-surface-line bg-white text-ink-soft transition hover:border-ink-faint hover:bg-surface-sunk active:bg-surface-line"
            aria-label={
              line.quantity === 1
                ? `Remove ${line.name}`
                : `One less ${line.name}`
            }
          >
            <LuMinus size={18} strokeWidth={2.5} aria-hidden />
          </button>
          <span
            className="w-8 text-center text-h2 font-extrabold text-ink tabular"
            aria-live="polite"
          >
            {line.quantity}
          </span>
          <button
            type="button"
            onClick={() => onIncrement(line)}
            /* Deliberately not filled orange: six of these stacked would out-shout Checkout. */
            className="grid h-tap w-tap place-items-center rounded-lg border border-surface-line bg-white text-brand-800 transition hover:border-brand hover:bg-brand-50 active:bg-brand-100"
            aria-label={`One more ${line.name}`}
          >
            <LuPlus size={18} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      )}

      <p className="w-[72px] shrink-0 text-right text-h2 font-extrabold text-ink tabular">
        {formatMoney(amount, currency)}
      </p>
    </li>
  );
});
