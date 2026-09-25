import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { formatNumber } from "../../lib/format";
import { toast } from "../../store/toastStore";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Segmented } from "../ui/Segmented";

export function StockAdjustModal({ product, onClose, onSaved }) {
  const [mode, setMode] = useState("ADD");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setMode("ADD");
    setQuantity("");
    setReason("");
    setError(null);
  }, [product?.id]);

  if (!product) return null;

  const qty = Number(quantity) || 0;
  const next =
    mode === "SET"
      ? qty
      : mode === "ADD"
        ? product.stock + qty
        : product.stock - qty;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/products/${product.id}/stock`, {
        mode,
        quantity: qty,
        reason,
      });
      toast.success(`${product.name} stock updated`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Update stock"
      description={product.name}
      footer={
        <Button
          className="w-full"
          onClick={save}
          loading={saving}
          disabled={qty <= 0 || reason.trim().length < 2}
        >
          Update to {formatNumber(Math.max(0, next))} {product.unit}
        </Button>
      }
    >
      <div className="rounded-lg bg-[#F8F4EE] px-3 py-2.5 text-body">
        On shelf now:{" "}
        <span className="font-extrabold text-gray-900 tabular">
          {formatNumber(product.stock)} {product.unit}
        </span>
      </div>

      <div className="mt-4">
        <Segmented
          className="w-full"
          ariaLabel="Adjustment type"
          value={mode}
          onChange={setMode}
          options={[
            { value: "ADD", label: "Received" },
            { value: "REMOVE", label: "Removed" },
            { value: "SET", label: "Counted" },
          ]}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="stock-qty" className="label">
          {mode === "SET"
            ? `Counted stock (${product.unit})`
            : `Quantity (${product.unit})`}
        </label>
        <input
          id="stock-qty"
          inputMode="decimal"
          className="field tabular"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))}
          autoFocus
        />
      </div>

      <div className="mt-4">
        <label htmlFor="stock-reason" className="label">
          Reason
        </label>
        <input
          id="stock-reason"
          className="field"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            mode === "ADD"
              ? "Morning delivery"
              : mode === "REMOVE"
                ? "Damaged in storage"
                : "Stock count"
          }
          maxLength={200}
        />
      </div>

      {next < 0 ? (
        <p className="mt-3 rounded-lg bg-[#FFF1E6] text-[#9A3F0B] px-3 py-2 text-desc">
          That is more than the shelf holds. Stock will be set to 0.
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-desc text-rose-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
