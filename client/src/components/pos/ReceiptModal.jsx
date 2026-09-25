import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
  LuCircleCheck,
  LuCloudUpload,
  LuPrinter,
  LuReceipt,
  LuSend,
  LuUsb,
} from "react-icons/lu";
import { receiptToWhatsAppText, whatsappLink } from "../../lib/checkout";
import { receiptToEscPos } from "../../lib/escpos";
import { formatMoney } from "../../lib/format";
import { useHardwareStore } from "../../store/hardwareStore";
import { toast } from "../../store/toastStore";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

function ThermalReceipt({ r }) {
  const cur = (n) => formatMoney(n, r.store?.currency || "INR");
  return (
    <div className="mx-auto w-[72mm] font-mono text-[11px] leading-[1.35] text-black">
      <div className="text-center">
        <p className="text-[14px] font-bold">{r.store?.storeName}</p>
        {r.store?.address ? <p>{r.store.address}</p> : null}
        {r.store?.gstin ? <p>GSTIN {r.store.gstin}</p> : null}
        {r.store?.phone ? <p>Ph {r.store.phone}</p> : null}
      </div>
      <p className="my-1">{"-".repeat(42)}</p>
      <div className="flex justify-between">
        <span>{r.reference}</span>
        <span>{r.dateLabel}</span>
      </div>
      <p>
        Cashier {r.cashierName} · {r.terminalId}
      </p>
      <p className="my-1">{"-".repeat(42)}</p>
      {r.lines.map((l, i) => (
        <div key={i} className="mb-0.5">
          <p>{l.name}</p>
          <div className="flex justify-between">
            <span>
              {"  "}
              {l.quantityLabel} × {cur(l.unitPrice)}
              {l.discountPercent ? ` (−${l.discountPercent}%)` : ""}
            </span>
            <span>{cur(l.amount)}</span>
          </div>
        </div>
      ))}
      <p className="my-1">{"-".repeat(42)}</p>
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{cur(r.totals.subtotal)}</span>
      </div>
      {r.totals.discountTotal ? (
        <div className="flex justify-between">
          <span>Discounts</span>
          <span>−{cur(r.totals.discountTotal)}</span>
        </div>
      ) : null}
      <div className="flex justify-between">
        <span>CGST {r.totals.taxRate / 2}%</span>
        <span>{cur(r.totals.cgst)}</span>
      </div>
      <div className="flex justify-between">
        <span>SGST {r.totals.taxRate / 2}%</span>
        <span>{cur(r.totals.sgst)}</span>
      </div>
      <div className="flex justify-between text-[13px] font-bold">
        <span>TOTAL</span>
        <span>{cur(r.totals.grandTotal)}</span>
      </div>
      <div className="flex justify-between">
        <span>Paid by {r.paymentMethod}</span>
        <span>{cur(r.amountTendered ?? r.totals.grandTotal)}</span>
      </div>
      {r.changeDue ? (
        <div className="flex justify-between">
          <span>Change</span>
          <span>{cur(r.changeDue)}</span>
        </div>
      ) : null}
      <p className="my-1">{"-".repeat(42)}</p>
      <p className="text-center">
        {r.store?.receiptFooter || "Thank you for shopping with us."}
      </p>
      {r.pending ? (
        <p className="mt-1 text-center">
          Bill saved on this register; syncs automatically
        </p>
      ) : null}
    </div>
  );
}

export function ReceiptModal({ receipt, onClose }) {
  const { printer, printBytes, connectPrinter, serialSupported } =
    useHardwareStore();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!receipt) return undefined;
    const onKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [receipt, onClose]);

  if (!receipt) return null;
  const currency = receipt.store?.currency || "INR";

  const printThermal = async () => {
    setSending(true);
    try {
      if (printer.status !== "connected") await connectPrinter();
      if (useHardwareStore.getState().printer.status !== "connected") return;
      await printBytes(receiptToEscPos(receipt));
      toast.success("Sent to the receipt printer");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="sm"
        title="Sale complete"
        footer={
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => window.print()}>
                <LuPrinter aria-hidden /> Print
              </Button>
              {receipt.customerPhone ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    window.open(
                      whatsappLink(
                        receipt.customerPhone,
                        receiptToWhatsAppText(receipt),
                      ),
                      "_blank",
                      "noopener",
                    )
                  }
                >
                  <LuSend aria-hidden /> WhatsApp
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={printThermal}
                  loading={sending}
                  disabled={!serialSupported}
                >
                  <LuUsb aria-hidden /> Thermal
                </Button>
              )}
            </div>
            <Button className="w-full" size="lg" onClick={onClose}>
              New bill
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand text-white ring-8 ring-brand-50">
            <LuCircleCheck size={30} aria-hidden />
          </div>
          <p className="mt-4 text-h1 font-extrabold text-gray-900 tabular">
            {formatMoney(receipt.totals.grandTotal, currency)}
          </p>
          <p className="mt-0.5 text-desc text-slate-500">{receipt.reference}</p>
          {receipt.changeDue ? (
            <p className="mt-3 rounded-full bg-brand-50 px-4 py-1.5 text-body font-semibold text-brand-800 tabular">
              Return {formatMoney(receipt.changeDue, currency)} change
            </p>
          ) : null}
          {receipt.totals.discountTotal ? (
            <p className="mt-2 text-desc font-semibold text-[#FF7B29]">
              Customer saved{" "}
              {formatMoney(receipt.totals.discountTotal, currency)}
            </p>
          ) : null}
          {receipt.pending ? (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#FFF1E6] text-[#9A3F0B] px-3 py-2 text-desc">
              <LuCloudUpload aria-hidden /> Saved on this register. The invoice
              number is assigned when it uploads.
            </p>
          ) : null}
        </div>

        <details className="mt-5 rounded-lg bg-[#F8F4EE] p-3">
          <summary className="cursor-pointer list-none text-desc font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <LuReceipt aria-hidden /> View receipt
            </span>
          </summary>
          <div className="mt-3 overflow-x-auto rounded-lg bg-white p-3 ring-1 ring-black/5">
            <ThermalReceipt r={receipt} />
          </div>
        </details>

        {printer.status === "connected" && receipt.customerPhone ? (
          <button
            type="button"
            onClick={printThermal}
            className="mt-3 inline-flex items-center gap-1.5 text-desc font-semibold text-brand-700"
          >
            <LuUsb aria-hidden /> Also print on the thermal printer
          </button>
        ) : null}
      </Modal>
      {createPortal(
        <ThermalReceipt r={receipt} />,
        document.getElementById("print-root"),
      )}
    </>
  );
}
