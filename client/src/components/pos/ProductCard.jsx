import { memo } from "react";
import { LuPlus, LuScale } from "react-icons/lu";
import { formatMoney, formatNumber } from "../../lib/format";
import { ProductThumb } from "./ProductThumb";

/*
 * Only says something when there is something to say. "64 pack in stock" is noise on every
 * tile; "Only 7 left" and "Out of stock" are the two cases a cashier has to act on.
 */
function stockWarning(p) {
  if (p.stock <= 0)
    return { text: "Out of stock", className: "bg-stock-outBg text-stock-out" };
  if (p.stock <= p.lowStockThreshold)
    return {
      text: `${formatNumber(p.stock)} ${p.unit} left`,
      className: "bg-stock-lowBg text-stock-low",
    };
  return null;
}

/*
 * Fixed height, three bands: name, then the small print, then the price against the action.
 * A fixed height is what keeps the grid level without reserving empty rows inside every tile,
 * and it roughly doubles how much of the catalogue is reachable without scrolling.
 */
export const ProductCard = memo(function ProductCard({
  product,
  inCartQty,
  currency,
  onSelect,
}) {
  const effective = product.price * (1 - (product.discountPercent || 0) / 100);
  const warning = stockWarning(product);
  const soldOut = product.stock <= 0;
  const Icon = product.soldByWeight ? LuScale : LuPlus;

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      title={product.name}
      aria-label={`Add ${product.name}, ${formatMoney(effective, currency)} per ${product.unit}`}
      className={`group relative flex min-h-[124px] flex-col rounded-xl border bg-white p-3 text-left transition
        ${soldOut ? "border-surface-line opacity-60" : "border-surface-line hover:border-brand hover:bg-brand-50/40 active:bg-brand-50"}`}
    >
      {inCartQty ? (
        <span
          key={inCartQty}
          className="absolute right-2 top-2 grid h-6 min-w-6 animate-pop place-items-center rounded-md bg-ink px-1.5 text-desc font-bold text-white tabular"
          aria-label={`${inCartQty} on the bill`}
        >
          {product.soldByWeight ? "✓" : inCartQty}
        </span>
      ) : null}

      <div className="flex min-w-0 items-start gap-2">
        {product.imageUrl ? (
          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-surface-sunk">
            <ProductThumb src={product.imageUrl} name={product.name} />
          </span>
        ) : null}
        <span
          className={`line-clamp-2 min-w-0 text-body font-bold leading-5 text-ink ${inCartQty ? "pr-7" : ""}`}
        >
          {product.name}
        </span>
      </div>

      <div className="no-scrollbar mt-auto flex items-center gap-1.5 overflow-hidden whitespace-nowrap pt-1.5 text-desc">
        {/* On the narrowest tiles a stock warning matters more than the code, so the code yields. */}
        <span
          className={`shrink-0 font-semibold text-ink-faint tabular ${
            warning || product.discountPercent > 0 ? "hidden sm:inline" : ""
          }`}
        >
          {product.code}
        </span>
        {warning ? (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${warning.className}`}
          >
            {warning.text}
          </span>
        ) : null}
        {/* A markdown on something you cannot sell is just noise competing for the row. */}
        {product.discountPercent > 0 && !soldOut ? (
          <span className="shrink-0 rounded bg-brand px-1.5 py-0.5 font-bold text-ink tabular">
            {formatNumber(product.discountPercent)}% off
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate tabular">
          <span className="text-num font-extrabold text-ink">
            {formatMoney(effective, currency)}
          </span>
          {/* No struck-through original here: the badge above already says there is a markdown,
              and at tile width the second figure truncates into nonsense. */}
          <span className="text-desc text-ink-muted">/{product.unit}</span>
        </span>
        {/*
          Decoration, not a control: the whole tile is the button. On a phone the two-column
          grid leaves ~150px for the price, so the chip steps aside there and the weighed
          items keep a small scale mark instead.
        */}
        <span
          className={`hidden h-tap w-tap shrink-0 place-items-center rounded-xl transition sm:grid
            ${soldOut ? "bg-surface-sunk text-ink-faint" : "bg-brand-50 text-brand-800 group-hover:bg-brand group-hover:text-ink group-active:bg-brand-600"}`}
          aria-hidden
        >
          <Icon size={20} strokeWidth={2.5} />
        </span>
        {product.soldByWeight ? (
          <LuScale
            className="shrink-0 text-brand-800 sm:hidden"
            size={16}
            strokeWidth={2.5}
            aria-hidden
          />
        ) : null}
      </div>
    </button>
  );
});
