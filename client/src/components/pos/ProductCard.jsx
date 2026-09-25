import { memo } from "react";
import { LuPlus, LuScale } from "react-icons/lu";
import { formatMoney, formatNumber } from "../../lib/format";
import { ProductThumb } from "./ProductThumb";

function stockNote(p) {
  if (p.stock <= 0) return { text: "Out of stock", className: "text-rose-600" };
  if (p.stock <= p.lowStockThreshold)
    return {
      text: `Only ${formatNumber(p.stock)} ${p.unit} left`,
      className: "text-amber-600",
    };
  return {
    text: `${formatNumber(p.stock)} ${p.unit} in stock`,
    className: "text-slate-500",
  };
}

export const ProductCard = memo(function ProductCard({
  product,
  inCartQty,
  currency,
  onSelect,
}) {
  const effective = product.price * (1 - (product.discountPercent || 0) / 100);
  const stock = stockNote(product);
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="group flex flex-col rounded-xl bg-white p-2 text-left shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:ring-brand/40"
      aria-label={`Add ${product.name}, ${formatMoney(effective, currency)} per ${product.unit}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#F8F4EE]">
        <ProductThumb
          src={product.imageUrl}
          name={product.name}
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {product.discountPercent > 0 ? (
          <span className="absolute left-2 top-2 rounded bg-[#FF7B29] px-1.5 py-0.5 text-[11px] font-bold text-white">
            {formatNumber(product.discountPercent)}% off
          </span>
        ) : null}
        {inCartQty ? (
          <span
            key={inCartQty}
            className="absolute right-2 top-2 grid h-6 min-w-6 animate-pop place-items-center rounded-full bg-brand px-1.5 text-desc font-semibold text-white tabular"
          >
            {product.soldByWeight ? "✓" : inCartQty}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col px-1.5 pb-1 pt-2.5">
        <h3 className="line-clamp-2 min-h-[40px] text-body font-bold leading-5 text-gray-900">
          {product.name}
        </h3>
        <p className={`mt-0.5 truncate text-desc ${stock.className}`}>
          {stock.text}
        </p>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            {product.discountPercent > 0 ? (
              <p className="text-desc text-slate-400 line-through tabular">
                {formatMoney(product.price, currency)}
              </p>
            ) : (
              <p className="text-desc text-slate-400">Code {product.code}</p>
            )}
            <p className="truncate tabular">
              <span className="text-body font-extrabold text-[#FF7B29]">
                {formatMoney(effective, currency)}
              </span>
              <span className="text-desc text-slate-500">/{product.unit}</span>
            </p>
          </div>
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-white shadow-md shadow-brand/30 transition group-hover:scale-110 group-hover:bg-brand-700"
            aria-hidden
          >
            {product.soldByWeight ? (
              <LuScale size={16} />
            ) : (
              <LuPlus size={16} />
            )}
          </span>
        </div>
      </div>
    </button>
  );
});
