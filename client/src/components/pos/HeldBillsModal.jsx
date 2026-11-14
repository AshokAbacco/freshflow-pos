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
        <ul className="divide-y divide-surface-line">
          {heldBills.map((bill) => {
            const total = computeBill({
              items: bill.lines,
              billDiscount: bill.billDiscount,
              taxRate,
            });
            return (
              <li key={bill.id} className="flex items-center gap-3 py-3">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-800"
                  aria-hidden
                >
                  <LuLayers />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-bold text-ink">
                    {bill.label}
                  </p>
                  <p className="truncate text-desc text-ink-muted">
                    {bill.lines.length} item{bill.lines.length === 1 ? "" : "s"}
                    , {relativeTime(bill.heldAt)}
                  </p>
                  <p className="text-num font-extrabold text-ink tabular">
                    {formatMoney(fromPaise(total.grandTotal), currency)}
                  </p>
                </div>
                <Button
                  size="md"
                  onClick={async () => {
                    await resumeHeld(bill.id);
                    onClose();
                  }}
                >
                  Resume
                </Button>
                <Button
                  size="icon"
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
