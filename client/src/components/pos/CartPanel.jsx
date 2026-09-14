import { LuPause, LuPercent, LuShoppingBasket, LuTrash2, LuX } from 'react-icons/lu';
import { useBill } from '../../hooks/useBill';
import { formatMoney } from '../../lib/format';
import { fromPaise } from '../../lib/pricing';
import { useCartStore } from '../../store/cartStore';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';
import { CartLine } from './CartLine';

export function CartPanel({ onCheckout, onHold, onDiscount, inSheet = false }) {
  const { lines, billDiscount, bill, itemCount, currency } = useBill();
  const { setQuantity, removeLine, clear, setBillDiscount, lastAddedLineId } = useCartStore();

  const increment = (line) => setQuantity(line.lineId, line.quantity + 1);
  const decrement = (line) => setQuantity(line.lineId, line.quantity - 1);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <header className={`flex items-center gap-2 ${inSheet ? 'pb-2' : 'px-5 pb-3 pt-5'}`}>
        {inSheet ? (
          <p className="flex-1 text-desc text-slate-500">
            {itemCount} item{itemCount === 1 ? '' : 's'}
          </p>
        ) : (
          <div className="min-w-0 flex-1">
            <h2>Current bill</h2>
            <p className="text-desc text-slate-500">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </p>
          </div>
        )}
        <Button variant="soft" size="sm" onClick={onHold} disabled={!lines.length}>
          <LuPause aria-hidden /> Hold
        </Button>
        <Button variant="ghost" size="iconSm" onClick={clear} disabled={!lines.length} aria-label="Clear bill" title="Clear bill">
          <LuTrash2 aria-hidden />
        </Button>
      </header>

      <div className={`scroll-thin min-h-0 flex-1 overflow-y-auto ${inSheet ? '' : 'px-3'}`}>
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
          <EmptyState icon={LuShoppingBasket} title="No items yet" description="Scan a barcode, type a product code, or tap a product to start the bill." />
        )}
      </div>

      <footer className={`space-y-3 border-t border-slate-100 pt-3 ${inSheet ? 'pb-1' : 'px-5 pb-5'}`}>
        {bill.billDiscount > 0 ? (
          <div className="flex items-center gap-2 rounded-2xl bg-brand-50 px-3 py-2">
            <LuPercent className="shrink-0 text-brand" aria-hidden />
            <button type="button" onClick={onDiscount} className="min-w-0 flex-1 text-left">
              <p className="truncate text-desc font-semibold text-brand-800">
                {billDiscount.type === 'PERCENT' ? `${billDiscount.value}% bill discount` : `${formatMoney(billDiscount.value, currency)} off the bill`}
              </p>
              {billDiscount.reason ? <p className="truncate text-desc text-brand-700/80">{billDiscount.reason}</p> : null}
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
            className="inline-flex items-center gap-1.5 text-desc font-semibold text-brand-700 hover:text-brand-800 disabled:text-slate-300"
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

        <div className="flex items-center gap-4 pt-1">
          <div className="min-w-0">
            <p className="text-desc text-slate-500">Total price</p>
            <p className="truncate text-h1 font-bold text-slate-900 tabular">{formatMoney(fromPaise(bill.grandTotal), currency)}</p>
          </div>
          <Button size="lg" className="flex-1" onClick={onCheckout} disabled={!lines.length}>
            Checkout
          </Button>
        </div>
        {!inSheet ? <p className="hidden text-center text-desc text-slate-400 lg:block">F2 search, F4 hold, F8 checkout, F9 held bills</p> : null}
      </footer>
    </div>
  );
}
