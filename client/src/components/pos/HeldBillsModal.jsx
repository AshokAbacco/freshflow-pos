import { LuLayers, LuTrash2 } from "react-icons/lu";
import { formatMoney, relativeTime } from "../../lib/format";
import { computeBill, fromPaise } from "../../lib/pricing";
import { useCartStore } from "../../store/cartStore";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { EmptyState } from "../ui/States";

export function HeldBillsModal({ open, onClose, taxRate, currency }) {
  const { heldBills, resumeHeld, discardHeld } = useCartStore();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Held bills"
      description="Parked carts waiting on this register"
    >
      {heldBills.length === 0 ? (
        <EmptyState
          icon={LuLayers}
          title="No held bills"
          description="Park a bill when a customer steps away, then pick it up again here."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {heldBills.map((bill) => {
            const total = computeBill({
              items: bill.lines,
              billDiscount: bill.billDiscount,
              taxRate,
            });
            return (
              <li key={bill.id} className="flex items-center gap-3 py-3">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand"
                  aria-hidden
                >
                  <LuLayers />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-gray-900">
                    {bill.label}
                  </p>
                  <p className="truncate text-desc text-slate-500">
                    {bill.lines.length} item{bill.lines.length === 1 ? "" : "s"}
                    , {relativeTime(bill.heldAt)}
                  </p>
                  <p className="text-body font-extrabold text-[#FF7B29] tabular">
                    {formatMoney(fromPaise(total.grandTotal), currency)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    await resumeHeld(bill.id);
                    onClose();
                  }}
                >
                  Resume
                </Button>
                <Button
                  size="iconSm"
                  variant="ghost"
                  aria-label={`Discard ${bill.label}`}
                  onClick={() => discardHeld(bill.id)}
                >
                  <LuTrash2 aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
