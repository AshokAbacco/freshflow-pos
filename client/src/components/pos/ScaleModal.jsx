import { useEffect, useMemo, useState } from 'react';
import { LuMinus, LuPlug, LuPlus, LuScale } from 'react-icons/lu';
import { formatMoney } from '../../lib/format';
import { computeBill, fromPaise, roundQty } from '../../lib/pricing';
import { useHardwareStore } from '../../store/hardwareStore';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ProductThumb } from './ProductThumb';

const STEP_KG = 0.25;
const LIVE_STALE_MS = 2500;

export function ScaleModal({ product, currency, onClose, onAdd }) {
  const { serialSupported, scale, connectScale } = useHardwareStore();
  const [manualGross, setManualGross] = useState(0);
  const [manualText, setManualText] = useState('');
  const [tare, setTare] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    setManualGross(0);
    setManualText('');
    setTare(0);
  }, [product?.id]);

  // Re-evaluate "live" freshness while a scale is connected.
  useEffect(() => {
    if (scale.status !== 'connected') return undefined;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [scale.status]);

  const live = scale.status === 'connected' && scale.reading && Date.now() - scale.reading.at < LIVE_STALE_MS;
  const gross = live ? scale.reading.kg : manualGross;
  const net = roundQty(Math.max(0, gross - tare));

  const amount = useMemo(() => {
    if (!product) return 0;
    const bill = computeBill({ items: [{ quantity: net, unitPrice: product.price, discountPercent: product.discountPercent }], taxRate: 0 });
    return fromPaise(bill.grandTotal);
  }, [net, product]);

  const setGross = (kg) => {
    const v = roundQty(Math.max(0, kg));
    setManualGross(v);
    setManualText(v ? v.toFixed(3) : '');
  };

  const add = () => {
    if (net > 0) onAdd(product, net);
  };

  if (!product) return null;

  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      title="Weigh item"
      description={live ? 'Reading live from the connected scale' : 'Enter or adjust the weight on the platter'}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-desc text-slate-500">Amount</p>
            <p className="text-h1 font-bold tabular">{formatMoney(amount, currency)}</p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={add} disabled={net <= 0}>
            Add to bill
          </Button>
        </div>
      }
    >
      <div
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
      >
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-brand-50">
            <ProductThumb src={product.imageUrl} name={product.name} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate">{product.name}</h3>
            <p className="text-desc text-slate-500 tabular">
              {formatMoney(product.price, currency)} per {product.unit}
              {product.discountPercent > 0 ? `, ${product.discountPercent}% markdown applied` : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-3xl bg-brand-50 p-5 text-center">
          <p className="text-desc font-medium text-brand-700">Net weight</p>
          <p className="mt-1 text-h1 font-bold text-brand-800 tabular" aria-live="polite">
            {net.toFixed(3)} kg
          </p>
          <div className="mt-2 flex justify-center gap-4 text-desc text-brand-700/80 tabular">
            <span>Gross {gross.toFixed(3)} kg</span>
            <span>Tare {tare.toFixed(3)} kg</span>
          </div>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-desc text-slate-600">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? (scale.reading.stable ? 'bg-brand' : 'animate-pulse bg-amber-500') : 'bg-slate-400'}`} aria-hidden />
            {live ? (scale.reading.stable ? 'Stable reading' : 'Settling') : 'Manual entry'}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <Button variant="secondary" onClick={() => setGross(manualGross - STEP_KG)} disabled={live || manualGross <= 0} className="!px-2">
            <LuMinus aria-hidden /> 250 g
          </Button>
          <Button variant="secondary" onClick={() => setGross(manualGross + STEP_KG)} disabled={live} className="!px-2">
            <LuPlus aria-hidden /> 250 g
          </Button>
          <Button variant="soft" onClick={() => setTare(gross)} disabled={gross <= 0} className="!px-2">
            Tare
          </Button>
          <Button variant="ghost" onClick={() => { setTare(0); if (!live) setGross(0); }} className="!px-2">
            Zero
          </Button>
        </div>

        {!live ? (
          <div className="mt-4">
            <label htmlFor="gross-weight" className="label">
              Gross weight on platter (kg)
            </label>
            <input
              id="gross-weight"
              inputMode="decimal"
              className="field tabular"
              placeholder="0.000"
              value={manualText}
              onChange={(e) => {
                const text = e.target.value.replace(/[^\d.]/g, '');
                setManualText(text);
                setManualGross(roundQty(Number(text) || 0));
              }}
            />
          </div>
        ) : null}

        {serialSupported && scale.status !== 'connected' ? (
          <button
            type="button"
            onClick={() => connectScale()}
            className="mt-4 inline-flex items-center gap-1.5 text-desc font-semibold text-brand-700 hover:text-brand-800"
          >
            <LuPlug aria-hidden /> Connect a USB or RS-232 scale
          </button>
        ) : null}
        {scale.error ? <p className="mt-2 text-desc text-rose-600">{scale.error}</p> : null}
        {!serialSupported ? (
          <p className="mt-4 flex items-center gap-1.5 text-desc text-slate-500">
            <LuScale aria-hidden /> Live scale readings need Chrome or Edge on a computer.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
