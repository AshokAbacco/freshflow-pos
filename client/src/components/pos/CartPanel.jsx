import {
  LuPause,
  LuPercent,
  LuScanBarcode,
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

const SHORTCUTS = [
  ["F2", "search"],
  ["F4", "hold"],
  ["F8", "pay"],
  ["F9", "held"],
];

export function CartPanel({ onCheckout, onHold, onDiscount, inSheet = false }) {
  const { lines, billDiscount, bill, itemCount, currency } = useBill();
  const { setQuantity, removeLine, clear, setBillDiscount, lastAddedLineId } =
    useCartStore();

  const increment = (line) => setQuantity(line.lineId, line.quantity + 1);
  const decrement = (line) => setQuantity(line.lineId, line.quantity - 1);
  const savings = bill.itemDiscount + bill.billDiscount;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <header
        className={`flex items-center gap-2 border-b border-surface-line ${inSheet ? "pb-3" : "px-4 py-3"}`}
      >
        <div className="min-w-0 flex-1">
          {/* The bottom sheet already carries this title, so it is not repeated inside. */}
          {!inSheet ? (
            <h2 className="text-h2 font-extrabold text-ink">Current bill</h2>
          ) : null}
          <p className="text-desc text-ink-muted tabular">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onHold}
          disabled={!lines.length}
        >
          <LuPause aria-hidden /> Hold
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={clear}
          disabled={!lines.length}
          aria-label="Clear the bill"
          title="Clear the bill"
        >
          <LuTrash2 aria-hidden />
        </Button>
      </header>

      <div
        className={`scroll-thin min-h-0 flex-1 overflow-y-auto ${inSheet ? "-mx-5" : ""}`}
      >
        {lines.length ? (
          <ul>
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
            icon={LuScanBarcode}
            title="Scan to start"
            description="Scan a barcode, type a product code, or tap a product."
          />
        )}
      </div>

      <footer
        className={`border-t border-surface-line ${inSheet ? "pt-3" : "bg-surface px-4 py-3"}`}
      >
        {bill.billDiscount > 0 ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-brand-50 px-2 py-1.5">
            <LuPercent
              className="shrink-0 text-brand-800"
              size={14}
              aria-hidden
            />
            <button
              type="button"
              onClick={onDiscount}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-desc font-bold text-brand-800">
                {billDiscount.type === "PERCENT"
                  ? `${billDiscount.value}% off the bill`
                  : `${formatMoney(billDiscount.value, currency)} off the bill`}
                {billDiscount.reason ? (
                  <span className="font-normal"> · {billDiscount.reason}</span>
                ) : null}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setBillDiscount({ value: 0 })}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-brand-800 hover:bg-brand-100"
              aria-label="Remove the bill discount"
            >
              <LuX size={14} aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onDiscount}
            disabled={!lines.length}
            className="mb-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-desc font-bold text-brand-800 transition hover:bg-brand-50 disabled:text-ink-faint disabled:hover:bg-transparent"
          >
            <LuPercent size={14} aria-hidden /> Add a bill discount
          </button>
        )}

        <dl className="space-y-0.5 text-desc tabular">
          <div className="flex justify-between text-ink-muted">
            <dt>Subtotal</dt>
            <dd>{formatMoney(fromPaise(bill.subtotal), currency)}</dd>
          </div>
          {savings > 0 ? (
            <div className="flex justify-between font-semibold text-brand-800">
              <dt>You saved</dt>
              <dd>−{formatMoney(fromPaise(savings), currency)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-ink-muted">
            <dt>GST {bill.taxRate}%</dt>
            <dd>{formatMoney(fromPaise(bill.taxTotal), currency)}</dd>
          </div>
        </dl>

        {/* The number the cashier reads out and the customer checks. Nothing on screen beats it. */}
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t-2 border-ink/10 pt-2">
          <span className="text-h2 font-bold text-ink-soft">Total</span>
          <span className="truncate text-num-xl font-extrabold text-ink tabular">
            {formatMoney(fromPaise(bill.grandTotal), currency)}
          </span>
        </div>

        <Button
          size="lg"
          className="mt-2.5 w-full justify-between"
          onClick={onCheckout}
          disabled={!lines.length}
        >
          <span>Checkout</span>
          <span className="hidden rounded-md bg-ink/10 px-1.5 py-0.5 text-desc font-bold lg:inline">
            F8
          </span>
        </Button>

        {!inSheet ? (
          <p className="mt-2.5 hidden flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-desc text-ink-muted lg:flex">
            {SHORTCUTS.map(([key, label]) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <kbd className="kbd">{key}</kbd>
                {label}
              </span>
            ))}
          </p>
        ) : null}
      </footer>
    </div>
  );
}
