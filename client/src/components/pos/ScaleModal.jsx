import { useEffect, useMemo, useState } from "react";
import { LuMinus, LuPlug, LuPlus, LuScale } from "react-icons/lu";
import { formatMoney } from "../../lib/format";
import { computeBill, fromPaise, roundQty } from "../../lib/pricing";
import { useHardwareStore } from "../../store/hardwareStore";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

const STEP_KG = 0.25;
const PRESETS_KG = [0.25, 0.5, 1, 2];
const LIVE_STALE_MS = 2500;

export function ScaleModal({ product, currency, onClose, onAdd }) {
  const { serialSupported, scale, connectScale } = useHardwareStore();
  const [manualGross, setManualGross] = useState(0);
  const [manualText, setManualText] = useState("");
  const [tare, setTare] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    setManualGross(0);
    setManualText("");
    setTare(0);
  }, [product?.id]);

  // Re-evaluate "live" freshness while a scale is connected.
  useEffect(() => {
    if (scale.status !== "connected") return undefined;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [scale.status]);

  const live =
    scale.status === "connected" &&
    scale.reading &&
    Date.now() - scale.reading.at < LIVE_STALE_MS;
  const gross = live ? scale.reading.kg : manualGross;
  const net = roundQty(Math.max(0, gross - tare));

  const amount = useMemo(() => {
    if (!product) return 0;
    const bill = computeBill({
      items: [
        {
          quantity: net,
          unitPrice: product.price,
          discountPercent: product.discountPercent,
        },
      ],
      taxRate: 0,
    });
    return fromPaise(bill.grandTotal);
  }, [net, product]);

  const setGross = (kg) => {
    const v = roundQty(Math.max(0, kg));
    setManualGross(v);
    setManualText(v ? v.toFixed(3) : "");
  };

  const add = () => {
    if (net > 0) onAdd(product, net);
  };

  if (!product) return null;

  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      title={product.name}
      description={`${formatMoney(product.price, currency)} per ${product.unit}${
        product.discountPercent > 0
          ? `, ${product.discountPercent}% markdown applied`
          : ""
      }`}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-desc font-semibold text-ink-muted">Amount</p>
            <p className="truncate text-num-xl font-extrabold text-ink tabular">
              {formatMoney(amount, currency)}
            </p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" onClick={add} disabled={net <= 0}>
            Add to bill
          </Button>
        </div>
      }
    >
      <div
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      >
        {/* Reads like a scale head: dark, one big figure, the supporting numbers kept small. */}
        <div className="rounded-xl bg-ink px-5 py-4 text-center">
          <p className="text-desc font-semibold text-white/60">Net weight</p>
          <p
            className="mt-0.5 text-num-xl font-extrabold text-white tabular"
            aria-live="polite"
          >
            {net.toFixed(3)}{" "}
            <span className="text-num font-bold text-white/70">kg</span>
          </p>
          <div className="mt-2 flex justify-center gap-4 text-desc text-white/60 tabular">
            <span>Gross {gross.toFixed(3)}</span>
            <span>Tare {tare.toFixed(3)}</span>
          </div>
          <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-desc font-semibold text-white/80">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                live
                  ? scale.reading.stable
                    ? "bg-stock-ok"
                    : "animate-pulse bg-brand"
                  : "bg-white/40"
              }`}
              aria-hidden
            />
            {live
              ? scale.reading.stable
                ? "Stable reading"
                : "Settling"
              : "Manual entry"}
          </p>
        </div>

        {!live ? (
          <>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {PRESETS_KG.map((kg) => (
                <button
                  key={kg}
                  type="button"
                  onClick={() => setGross(kg + tare)}
                  className="h-12 rounded-xl border border-surface-line bg-white text-body font-bold text-ink tabular transition hover:border-brand hover:bg-brand-50 active:bg-brand-100"
                >
                  {kg < 1 ? `${kg * 1000} g` : `${kg} kg`}
                </button>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setGross(manualGross - STEP_KG)}
                disabled={manualGross <= 0}
              >
                <LuMinus aria-hidden /> 250 g
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setGross(manualGross + STEP_KG)}
              >
                <LuPlus aria-hidden /> 250 g
              </Button>
            </div>

            <div className="mt-3">
              <label htmlFor="gross-weight" className="label">
                Or type the gross weight on the platter (kg)
              </label>
              <input
                id="gross-weight"
                inputMode="decimal"
                className="field tabular"
                placeholder="0.000"
                value={manualText}
                onChange={(e) => {
                  const text = e.target.value.replace(/[^\d.]/g, "");
                  setManualText(text);
                  setManualGross(roundQty(Number(text) || 0));
                }}
              />
            </div>
          </>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="soft"
            size="md"
            onClick={() => setTare(gross)}
            disabled={gross <= 0}
          >
            Tare the container
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setTare(0);
              if (!live) setGross(0);
            }}
          >
            Zero
          </Button>
        </div>

        {serialSupported && scale.status !== "connected" ? (
          <button
            type="button"
            onClick={() => connectScale()}
            className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-desc font-bold text-brand-800 transition hover:bg-brand-50"
          >
            <LuPlug size={14} aria-hidden /> Connect a USB or RS-232 scale
          </button>
        ) : null}
        {scale.error ? (
          <p className="mt-2 text-desc font-semibold text-stock-out">
            {scale.error}
          </p>
        ) : null}
        {!serialSupported ? (
          <p className="mt-3 flex items-center gap-1.5 text-desc text-ink-muted">
            <LuScale size={14} aria-hidden /> Live scale readings need Chrome or
            Edge on a computer.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
