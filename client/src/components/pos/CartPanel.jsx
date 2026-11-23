import {
  LuChevronsLeft,
  LuChevronsRight,
  LuPause,
  LuPercent,
  LuShoppingBasket,
  LuTrash2,
  LuX,
} from "react-icons/lu";
import { useBill } from "../../hooks/useBill";
import { formatMoney } from "../../lib/format";
import { fromPaise } from "../../lib/pricing";
import { useCartStore } from "../../store/cartStore";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/States";
import { CartLine } from "./CartLine";

export function CartPanel({
  onCheckout,
  onHold,
  onDiscount,
  inSheet = false,
  /*
   * "compact" or "wide" when docked. The panel carries its own controls for
   * this: the cashier reaches for them while looking at the bill, not at some
   * setting elsewhere. Left undefined in the phone sheet, where the sheet
   * itself is the width.
   */
  view,
  onCollapse,
  onToggleWidth,
}) {
  const { lines, billDiscount, bill, itemCount, currency } = useBill();
  const { setQuantity, removeLine, clear, setBillDiscount, lastAddedLineId } =
    useCartStore();

  const increment = (line) => setQuantity(line.lineId, line.quantity + 1);
  const decrement = (line) => setQuantity(line.lineId, line.quantity - 1);

  return (
    /* w-full/min-w-0: the rail sets the width, so the panel must not be sized
       by its own contents — at 300px that pushed 25px of itself out of view. */
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-white">
      <header
        className={`flex items-center gap-1.5 ${inSheet ? "pb-2" : "px-3 pb-2 pt-3"}`}
      >
        {inSheet ? (
          <p className="flex-1 text-desc text-slate-500">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </p>
        ) : (
          <>
            {/*
             * One line instead of three. The old stacked heading repeated what
             * the panel plainly is and cost a third of the header to say it.
             */}
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onCollapse}
              aria-label="Hide the bill"
              title="Hide the bill (F3)"
            >
              <LuChevronsRight aria-hidden />
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-extrabold text-gray-900">
                Current bill
              </h2>
              <p className="text-desc text-slate-500 tabular">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onToggleWidth}
              aria-label={
                view === "wide" ? "Narrow the bill" : "Widen the bill"
              }
              title={view === "wide" ? "Narrow the bill" : "Widen the bill"}
            >
              {view === "wide" ? (
                <LuChevronsRight aria-hidden />
              ) : (
                <LuChevronsLeft aria-hidden />
              )}
            </Button>
          </>
        )}
        <Button
          variant="soft"
          size="sm"
          onClick={onHold}
          disabled={!lines.length}
        >
          <LuPause aria-hidden />
          <span className={view === "compact" ? "sr-only" : ""}>Hold</span>
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={clear}
          disabled={!lines.length}
          aria-label="Clear bill"
          title="Clear bill"
        >
          <LuTrash2 aria-hidden />
        </Button>
      </header>

      <div
        className={`scroll-thin min-h-0 flex-1 overflow-y-auto ${inSheet ? "" : "px-2"}`}
      >
        {lines.length ? (
          <ul className="space-y-1 pb-2">
            {lines.map((line, i) => (
              <CartLine
                key={line.lineId}
                line={line}
                computed={bill.lines[i]}
                currency={currency}
                highlight={line.lineId === lastAddedLineId}
                onIncrement={increment}
                onDecrement={decrement}
                onRemove={removeLine}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={LuShoppingBasket}
            title="No items yet"
            description="Scan a barcode, type a product code, or tap a product to start the bill."
          />
        )}
      </div>

      <footer
        className={`space-y-2.5 border-t-2 border-dashed border-gray-200 pt-3 ${inSheet ? "pb-1" : "bg-[#FBFAF8] px-4 pb-4"}`}
      >
        {bill.billDiscount > 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2">
            <LuPercent className="shrink-0 text-brand" aria-hidden />
            <button
              type="button"
              onClick={onDiscount}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-desc font-semibold text-brand-800">
                {billDiscount.type === "PERCENT"
                  ? `${billDiscount.value}% bill discount`
                  : `${formatMoney(billDiscount.value, currency)} off the bill`}
              </p>
              {billDiscount.reason ? (
                <p className="truncate text-desc text-brand-700/80">
                  {billDiscount.reason}
                </p>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setBillDiscount({ value: 0 })}
              className="grid h-7 w-7 place-items-center rounded-full text-brand-700 hover:bg-brand-100"
              aria-label="Remove bill discount"
            >
              <LuX aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onDiscount}
            disabled={!lines.length}
            className="inline-flex items-center gap-1.5 text-desc font-bold text-[#FF7B29] hover:text-[#E0661A] disabled:text-slate-300"
          >
            <LuPercent aria-hidden /> Add bill discount
          </button>
        )}

        <dl className="space-y-1 text-body tabular">
          <div className="flex justify-between text-slate-600">
            <dt>Subtotal</dt>
            <dd>{formatMoney(fromPaise(bill.subtotal), currency)}</dd>
          </div>
          {bill.itemDiscount > 0 ? (
            <div className="flex justify-between text-brand-700">
              <dt>Markdowns</dt>
              <dd>−{formatMoney(fromPaise(bill.itemDiscount), currency)}</dd>
            </div>
          ) : null}
          {bill.billDiscount > 0 ? (
            <div className="flex justify-between text-brand-700">
              <dt>Bill discount</dt>
              <dd>−{formatMoney(fromPaise(bill.billDiscount), currency)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-slate-600">
            <dt>GST {bill.taxRate}%</dt>
            <dd>{formatMoney(fromPaise(bill.taxTotal), currency)}</dd>
          </div>
        </dl>

        {/*
         * Side by side there is room for both; at 300px the total was being
         * truncated to make way for the button, so the narrow panel stacks.
         */}
        <div
          className={`pt-1 ${view === "compact" && !inSheet ? "space-y-2" : "flex items-center gap-4"}`}
        >
          <div className="min-w-0">
            <p className="text-desc text-slate-500">Total price</p>
            <p className="truncate text-h1 font-extrabold text-gray-900 tabular">
              {formatMoney(fromPaise(bill.grandTotal), currency)}
            </p>
          </div>
          <Button
            size="lg"
            className={view === "compact" && !inSheet ? "w-full" : "flex-1"}
            onClick={onCheckout}
            disabled={!lines.length}
          >
            Checkout
          </Button>
        </div>
        {!inSheet ? (
          <p className="hidden flex-wrap justify-center gap-x-3 gap-y-1 text-desc text-slate-500 lg:flex">
            {[
              ["F2", "search"],
              ["F3", "bill"],
              ["F4", "hold"],
              ["F8", "checkout"],
              ["F9", "held bills"],
            ].map(([key, label]) => (
              <span key={key} className="inline-flex items-center gap-1">
                <kbd className="rounded bg-white px-1.5 py-0.5 font-sans text-[11px] font-bold text-gray-700 ring-1 ring-black/10">
                  {key}
                </kbd>
                {label}
              </span>
            ))}
          </p>
        ) : null}
      </footer>
    </div>
  );
}
