import { memo } from "react";
import { LuPlus, LuScale } from "react-icons/lu";
import { formatMoney, formatNumber } from "../../lib/format";
import { ProductThumb } from "./ProductThumb";

/*
 * Only says something when there is something to say. "42 kg in stock" was printed on every
 * tile, which cost a line on all of them and made the two cases that actually matter -- out,
 * and nearly out -- harder to pick out of the grid rather than easier.
 */
function stockNote(p) {
  if (p.stock <= 0) return { text: "Out of stock", className: "text-rose-600" };
  if (p.stock <= p.lowStockThreshold)
    return {
      text: `Only ${formatNumber(p.stock)} ${p.unit} left`,
      className: "text-amber-600",
    };
  return null;
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
      className="group flex flex-col rounded-lg bg-white p-1 text-left shadow-[0_5px_14px_-9px_rgba(0,0,0,0.2)] ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:ring-brand/40"
      aria-label={`Add ${product.name}, ${formatMoney(effective, currency)} per ${product.unit}`}
    >
      <div className="relative aspect-[3/2] overflow-hidden rounded-md bg-[#F8F4EE]">
        <ProductThumb
          src={product.imageUrl}
          name={product.name}
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {product.discountPercent > 0 ? (
          <span className="absolute left-1 top-1 rounded bg-[#FF7B29] px-1 py-px text-[10px] font-bold leading-tight text-white">
            {formatNumber(product.discountPercent)}%
          </span>
        ) : null}
        {inCartQty ? (
          <span
            key={inCartQty}
            className="absolute right-1 top-1 grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-white tabular"
          >
            {product.soldByWeight ? "✓" : inCartQty}
          </span>
        ) : null}
        {/* The code rides on the image, so it costs no height of its own. */}
        <span className="absolute bottom-0.5 left-1 rounded bg-white/85 px-1 text-[9px] font-semibold leading-tight text-slate-600 tabular">
          #{product.code}
        </span>
        {/*
         * The add button sits on the image rather than beside the price. Next to it, it took
         * ~34px of a 126px tile and pushed "₹119.90/bunch" into an ellipsis -- the one thing
         * on a tile that has to stay readable. Here it costs the row nothing.
         */}
        <span
          className="absolute bottom-0.5 right-0.5 grid h-6 w-6 place-items-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition group-hover:scale-110 group-hover:bg-brand-700"
          aria-hidden
        >
          {product.soldByWeight ? <LuScale size={13} /> : <LuPlus size={13} />}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-0.5 pb-0 pt-1">
        <h3 className="line-clamp-2 text-[12px] font-bold leading-[14px] text-gray-900">
          {product.name}
        </h3>
        {stock ? (
          <p
            className={`truncate text-[10px] leading-tight ${stock.className}`}
          >
            {stock.text}
          </p>
        ) : null}
        {/*
         * Only the price being charged. At this tile size the struck-out original had room
         * for about four characters before the ellipsis -- "₹12..." beside "₹114.48/pack"
         * reads as a rendering fault, and the badge on the image already says there is a
         * discount. The full before-and-after is on the bill line and in the product dialog.
         */}
        <div className="mt-auto pt-0.5">
          <span className="whitespace-nowrap tabular">
            <span className="text-[13px] font-extrabold text-[#FF7B29]">
              {formatMoney(effective, currency)}
            </span>
            <span className="text-[11px] text-slate-500">/{product.unit}</span>
          </span>
        </div>
      </div>
    </button>
  );
});
