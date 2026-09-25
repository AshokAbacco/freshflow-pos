import { memo } from "react";
import { LuMinus, LuPlus, LuX } from "react-icons/lu";
import { formatMoney } from "../../lib/format";
import { fromPaise } from "../../lib/pricing";
import { ProductThumb } from "./ProductThumb";

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
      className={`flex items-center gap-3 rounded-lg p-2 transition-colors ${highlight ? "bg-brand-50/70" : "hover:bg-[#FBFAF8]"}`}
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#F8F4EE]">
        <ProductThumb src={line.imageUrl} name={line.name} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-gray-900">{line.name}</p>
        <p className="truncate text-desc text-slate-500 tabular">
          {formatMoney(line.unitPrice, currency)}/{line.unit}
          {line.discountPercent > 0 ? `, ${line.discountPercent}% off` : ""}
        </p>
        <p className="font-extrabold text-[#FF7B29] tabular">
          {formatMoney(amount, currency)}
        </p>
      </div>
      {line.soldByWeight ? (
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-desc font-medium text-slate-700 tabular">
            {line.quantity.toFixed(3)} {line.unit}
          </span>
          <button
            type="button"
            onClick={() => onRemove(line.lineId)}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label={`Remove ${line.name}`}
          >
            <LuX aria-hidden />
          </button>
        </div>
      ) : (
        <div
          className="flex items-center gap-2"
          role="group"
          aria-label={`Quantity of ${line.name}`}
        >
          <button
            type="button"
            onClick={() => onDecrement(line)}
            className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            aria-label={
              line.quantity === 1
                ? `Remove ${line.name}`
                : `One less ${line.name}`
            }
          >
            <LuMinus aria-hidden />
          </button>
          <span
            className="w-6 text-center font-semibold tabular"
            aria-live="polite"
          >
            {line.quantity}
          </span>
          <button
            type="button"
            onClick={() => onIncrement(line)}
            className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white hover:bg-brand-700"
            aria-label={`One more ${line.name}`}
          >
            <LuPlus aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
});
