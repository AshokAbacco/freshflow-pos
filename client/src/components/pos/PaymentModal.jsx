import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { LuBanknote, LuCreditCard, LuQrCode } from "react-icons/lu";
import { formatMoney } from "../../lib/format";
import { buildUpiUri } from "../../lib/upi";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Segmented } from "../ui/Segmented";

function quickCashAmounts(total) {
  const options = new Set([Math.ceil(total)]);
  [10, 50, 100, 500, 2000].forEach((step) =>
    options.add(Math.ceil(total / step) * step),
  );
  return [...options]
    .filter((v) => v >= total)
    .sort((a, b) => a - b)
    .slice(0, 4);
}

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
  const [qr, setQr] = useState(null);
  const [reference] = useState(
    () => `B${Date.now().toString(36).toUpperCase()}`,
  );

  useEffect(() => {
    if (!open) return;
    setMethod(upiReady ? "UPI" : "CASH");
    setTendered("");
    setPhone("");
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
        width: 440,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0F172A", light: "#FFFFFF" },
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
      title="Take payment"
      description={`${itemCount} item${itemCount === 1 ? "" : "s"}`}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-desc text-slate-500">Total due</p>
            <p className="text-h1 font-extrabold text-gray-900 tabular">
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
                <div className="rounded-xl bg-white p-3 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.2)] ring-2 ring-brand/30">
                  {qr ? (
                    <img
                      src={qr}
                      alt={`UPI QR code for ${formatMoney(total, currency)}`}
                      className="h-[220px] w-[220px]"
                    />
                  ) : (
                    <div className="h-[220px] w-[220px] animate-pulse rounded-2xl bg-slate-100" />
                  )}
                </div>
                <p className="mt-3 text-body font-semibold">
                  Scan with any UPI app
                </p>
                <p className="mt-0.5 text-desc text-slate-500">
                  Pays {formatMoney(total, currency)} to {settings.upiVpa}.
                  Confirm once the customer’s app shows success.
                </p>
              </>
            ) : (
              <div className="w-full rounded-lg bg-[#FFF1E6] text-[#9A3F0B] p-4 text-left text-desc">
                {isAdmin
                  ? "Add the store’s UPI ID in Settings to show a payment QR here."
                  : "UPI QR is not set up yet. Ask an admin to add the store’s UPI ID, or take cash or card."}
              </div>
            )}
          </div>
        ) : null}

        {method === "CASH" ? (
          <div className="mt-4">
            <label htmlFor="cash-tendered" className="label">
              Cash received
            </label>
            <input
              id="cash-tendered"
              inputMode="decimal"
              autoFocus
              className="field tabular"
              placeholder={total.toFixed(2)}
              value={tendered}
              onChange={(e) =>
                setTendered(e.target.value.replace(/[^\d.]/g, ""))
              }
            />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {quickCashAmounts(total).map((amt) => (
                <Button
                  key={amt}
                  size="sm"
                  variant={tenderedNum === amt ? "primary" : "secondary"}
                  onClick={() => setTendered(String(amt))}
                >
                  {formatMoney(amt, currency).replace(/\.00$/, "")}
                </Button>
              ))}
            </div>
            <div
              className={`mt-4 flex items-center justify-between rounded-lg px-4 py-3 ${cashShort ? "bg-rose-50" : "bg-brand-50"}`}
            >
              <span
                className={`text-body font-medium ${cashShort ? "text-rose-700" : "text-brand-800"}`}
              >
                {cashShort ? "Still due" : "Change to return"}
              </span>
              <span
                className={`text-h2 font-extrabold tabular ${cashShort ? "text-rose-700" : "text-brand-800"}`}
              >
                {formatMoney(
                  cashShort ? total - tenderedNum : change,
                  currency,
                )}
              </span>
            </div>
          </div>
        ) : null}

        {method === "CARD" ? (
          <div className="mt-4 rounded-lg bg-[#F8F4EE] p-4 text-body text-slate-700">
            Charge{" "}
            <span className="font-semibold tabular">
              {formatMoney(total, currency)}
            </span>{" "}
            on the card machine, then confirm here once it is approved.
          </div>
        ) : null}

        <div className="mt-4">
          <label htmlFor="customer-phone" className="label">
            Customer mobile (optional, for a WhatsApp receipt)
          </label>
          <input
            id="customer-phone"
            type="tel"
            inputMode="tel"
            className="field"
            placeholder="98765 43210"
            maxLength={16}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))}
          />
        </div>
      </div>
    </Modal>
  );
}
