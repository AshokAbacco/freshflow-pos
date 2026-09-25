import { useEffect, useState } from "react";
import { formatMoney } from "../../lib/format";
import { fromPaise, toPaise } from "../../lib/pricing";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Segmented } from "../ui/Segmented";

const PRESETS = [5, 10, 15, 20];

export function DiscountModal({
  open,
  onClose,
  afterMarkdownsPaise,
  current,
  maxCashierPct,
  isAdmin,
  currency,
  onApply,
}) {
  const [type, setType] = useState("PERCENT");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setType(current?.type || "PERCENT");
    setValue(current?.value ? String(current.value) : "");
    setReason(current?.reason || "");
  }, [open, current]);

  const numeric = Math.max(0, Number(value) || 0);
  const discountPaise =
    type === "PERCENT"
      ? Math.round((afterMarkdownsPaise * Math.min(100, numeric)) / 100)
      : Math.min(afterMarkdownsPaise, toPaise(numeric));
  const effectivePct =
    afterMarkdownsPaise > 0 ? (discountPaise / afterMarkdownsPaise) * 100 : 0;
  const overCap = !isAdmin && effectivePct > maxCashierPct + 0.005;
  const invalid = numeric <= 0 || (type === "PERCENT" && numeric > 100);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Bill discount"
      description={
        isAdmin
          ? "Applied after item markdowns, before GST"
          : `Cashiers can give up to ${maxCashierPct}% off the bill`
      }
      footer={
        <div className="flex gap-2">
          {current?.value ? (
            <Button
              variant="dangerSoft"
              onClick={() => onApply({ type: "PERCENT", value: 0, reason: "" })}
            >
              Remove
            </Button>
          ) : null}
          <Button
            className="flex-1"
            disabled={invalid || overCap}
            onClick={() => onApply({ type, value: numeric, reason })}
          >
            Apply{" "}
            {discountPaise > 0
              ? formatMoney(fromPaise(discountPaise), currency)
              : "discount"}
          </Button>
        </div>
      }
    >
      <Segmented
        className="w-full"
        ariaLabel="Discount type"
        value={type}
        onChange={(v) => {
          setType(v);
          setValue("");
        }}
        options={[
          { value: "PERCENT", label: "Percent" },
          { value: "FLAT", label: "Amount" },
        ]}
      />

      <div className="mt-4">
        <label htmlFor="discount-value" className="label">
          {type === "PERCENT" ? "Discount (%)" : `Discount (${currency})`}
        </label>
        <input
          id="discount-value"
          inputMode="decimal"
          className="field tabular"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder={type === "PERCENT" ? "10" : "50"}
        />
      </div>

      {type === "PERCENT" ? (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={numeric === p ? "primary" : "secondary"}
              disabled={!isAdmin && p > maxCashierPct}
              onClick={() => setValue(String(p))}
            >
              {p}%
            </Button>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <label htmlFor="discount-reason" className="label">
          Reason (printed on the bill record)
        </label>
        <input
          id="discount-reason"
          className="field"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Loyal customer, damaged pack…"
        />
      </div>

      {overCap ? (
        <p
          className="mt-3 rounded-lg bg-[#FFF1E6] text-[#9A3F0B] px-3 py-2 text-desc"
          role="alert"
        >
          That is {effectivePct.toFixed(1)}% of the bill. Ask an admin to apply
          discounts above {maxCashierPct}%.
        </p>
      ) : null}
    </Modal>
  );
}
