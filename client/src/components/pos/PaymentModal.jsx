import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import {
  LuBanknote,
  LuCreditCard,
  LuDelete,
  LuQrCode,
  LuUser,
} from "react-icons/lu";
import { formatMoney } from "../../lib/format";
import { buildUpiUri } from "../../lib/upi";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Segmented } from "../ui/Segmented";

/* Indian currency notes, so the cashier taps what the customer actually handed over. */
const NOTES = [10, 20, 50, 100, 200, 500];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"];

export function PaymentModal({
  open,
  onClose,
  total,
  itemCount,
  settings,
  isAdmin,
  submitting,
  onConfirm,
}) {
  const currency = settings?.currency || "INR";
  const upiReady = Boolean(settings?.upiVpa);
  const [method, setMethod] = useState("CASH");
  const [tendered, setTendered] = useState("");
  const [phone, setPhone] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [qr, setQr] = useState(null);
  const [reference] = useState(
    () => `B${Date.now().toString(36).toUpperCase()}`,
  );

  useEffect(() => {
    if (!open) return;
    setMethod(upiReady ? "UPI" : "CASH");
    setTendered("");
    setPhone("");
    setShowPhone(false);
  }, [open, upiReady]);

  const upiUri = useMemo(
    () =>
      upiReady
        ? buildUpiUri({
            vpa: settings.upiVpa,
            payeeName: settings.upiPayeeName || settings.storeName,
            amount: total,
            reference,
            note: `${settings.storeName} bill`,
          })
        : null,
    [upiReady, settings, total, reference],
  );

  useEffect(() => {
    let cancelled = false;
    if (open && method === "UPI" && upiUri) {
      QRCode.toDataURL(upiUri, {
        width: 520,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#17120E", light: "#FFFFFF" },
      })
        .then((url) => !cancelled && setQr(url))
        .catch(() => !cancelled && setQr(null));
    }
    return () => {
      cancelled = true;
    };
  }, [open, method, upiUri]);

  const tenderedNum = Number(tendered) || 0;
  const cashShort =
    method === "CASH" && tendered !== "" && tenderedNum + 0.0001 < total;
  const change = method === "CASH" ? Math.max(0, tenderedNum - total) : 0;
  const canConfirm =
    !submitting &&
    (method !== "CASH" || tendered === "" || !cashShort) &&
    (method !== "UPI" || upiReady);

  const press = (key) => {
    if (key === "back") {
      setTendered((t) => t.slice(0, -1));
      return;
    }
    setTendered((t) => (t === "0" ? key : (t + key).slice(0, 8)));
  };
  const addNote = (value) =>
    setTendered((t) => String(Math.round((Number(t) || 0) + value)));

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm({
      paymentMethod: method,
      amountTendered:
        method === "CASH" ? (tendered === "" ? total : tenderedNum) : null,
      customerPhone: phone,
    });
  };

  const confirmLabel = {
    UPI: "Payment received",
    CASH: "Complete sale",
    CARD: "Card approved",
  }[method];

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      dismissible={!submitting}
      size="lg"
      title="Take payment"
      description={`${itemCount} item${itemCount === 1 ? "" : "s"}`}
      footer={
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-desc font-semibold text-ink-muted">Total due</p>
            <p className="truncate text-num-xl font-extrabold text-ink tabular">
              {formatMoney(total, currency)}
            </p>
          </div>
          <Button
            size="lg"
            onClick={confirm}
            disabled={!canConfirm}
            loading={submitting}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
            e.preventDefault();
            confirm();
          }
        }}
      >
        <Segmented
          className="w-full"
          ariaLabel="Payment method"
          value={method}
          onChange={setMethod}
          options={[
            { value: "UPI", label: "UPI", icon: LuQrCode },
            { value: "CASH", label: "Cash", icon: LuBanknote },
            { value: "CARD", label: "Card", icon: LuCreditCard },
          ]}
        />

        {method === "UPI" ? (
          <div className="mt-4 flex flex-col items-center text-center">
            {upiReady ? (
              <>
                <div className="rounded-xl border-2 border-surface-line bg-white p-3">
                  {qr ? (
                    <img
                      src={qr}
                      alt={`UPI QR code for ${formatMoney(total, currency)}`}
                      className="h-[240px] w-[240px]"
                    />
                  ) : (
                    <div className="h-[240px] w-[240px] animate-pulse rounded-lg bg-surface-sunk" />
                  )}
                </div>
                <p className="mt-3 text-h2 font-bold text-ink">
                  Scan with any UPI app
                </p>
                <p className="mt-1 max-w-sm text-desc text-ink-muted">
                  Pays {formatMoney(total, currency)} to {settings.upiVpa}.
                  Confirm once the customer’s app shows success.
                </p>
              </>
            ) : (
              <div className="w-full rounded-xl bg-stock-lowBg p-4 text-left text-body text-stock-low">
                {isAdmin
                  ? "Add the store’s UPI ID in Settings to show a payment QR here."
                  : "UPI QR is not set up yet. Ask an admin to add the store’s UPI ID, or take cash or card."}
              </div>
            )}
          </div>
        ) : null}

        {method === "CASH" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* Numpad: the register should never need the operating system keyboard. */}
            <div className="order-2 grid grid-cols-3 gap-2 sm:order-1">
              {KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => press(key)}
                  aria-label={key === "back" ? "Delete last digit" : key}
                  className="grid h-14 place-items-center rounded-xl border border-surface-line bg-white text-num font-bold text-ink transition hover:border-ink-faint hover:bg-surface-sunk active:bg-surface-line"
                >
                  {key === "back" ? <LuDelete size={20} aria-hidden /> : key}
                </button>
              ))}
            </div>

            <div className="order-1 flex flex-col sm:order-2">
              <div className="rounded-xl border border-surface-line bg-surface-sunk px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-desc font-semibold text-ink-muted">
                    Cash received
                  </span>
                  {tendered ? (
                    <button
                      type="button"
                      onClick={() => setTendered("")}
                      className="rounded px-1 text-desc font-bold text-brand-800 hover:bg-brand-50"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <p
                  className="truncate text-num-xl font-extrabold text-ink tabular"
                  aria-live="polite"
                >
                  {tendered
                    ? formatMoney(tenderedNum, currency)
                    : formatMoney(total, currency)}
                </p>
                {!tendered ? (
                  <p className="text-desc text-ink-faint">
                    Exact amount, unless you tap a note
                  </p>
                ) : null}
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {NOTES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => addNote(n)}
                    aria-label={`Add a ${formatMoney(n, currency)} note`}
                    className="h-11 rounded-lg border border-surface-line bg-white text-body font-bold text-ink-soft tabular transition hover:border-brand hover:bg-brand-50 active:bg-brand-100"
                  >
                    +{formatMoney(n, currency).replace(/\.00$/, "")}
                  </button>
                ))}
              </div>

              {/* Change is what the cashier has to count back, so it is as loud as the total. */}
              <div
                className={`mt-2 flex-1 rounded-xl px-3 py-2.5 ${
                  !tendered
                    ? "bg-surface-sunk"
                    : cashShort
                      ? "bg-stock-outBg"
                      : "bg-brand-50"
                }`}
                aria-live="polite"
              >
                <p
                  className={`text-desc font-bold ${
                    !tendered
                      ? "text-ink-muted"
                      : cashShort
                        ? "text-stock-out"
                        : "text-brand-800"
                  }`}
                >
                  {cashShort ? "Still due" : "Change to return"}
                </p>
                <p
                  className={`truncate text-num-xl font-extrabold tabular ${
                    !tendered
                      ? "text-ink-faint"
                      : cashShort
                        ? "text-stock-out"
                        : "text-ink"
                  }`}
                >
                  {formatMoney(
                    cashShort ? total - tenderedNum : change,
                    currency,
                  )}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {method === "CARD" ? (
          <div className="mt-4 rounded-xl border border-surface-line bg-surface-sunk p-4 text-body text-ink-soft">
            Charge{" "}
            <span className="font-bold tabular">
              {formatMoney(total, currency)}
            </span>{" "}
            on the card machine, then confirm here once it is approved.
          </div>
        ) : null}

        {/* Rarely used, so it stays out of the way until it is wanted. */}
        <div className="mt-4">
          {showPhone ? (
            <>
              <label htmlFor="customer-phone" className="label">
                Customer mobile, for a WhatsApp receipt
              </label>
              <input
                id="customer-phone"
                type="tel"
                inputMode="tel"
                autoFocus
                className="field tabular"
                placeholder="98765 43210"
                maxLength={16}
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))
                }
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowPhone(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-desc font-bold text-brand-800 transition hover:bg-brand-50"
            >
              <LuUser size={14} aria-hidden /> Add customer mobile
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
