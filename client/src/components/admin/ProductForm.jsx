import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../store/toastStore";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

const BLANK = {
  code: "",
  barcode: "",
  name: "",
  description: "",
  categoryId: "",
  price: "",
  unit: "pcs",
  soldByWeight: false,
  stock: "0",
  lowStockThreshold: "5",
  discountPercent: "0",
  isQuickKey: false,
  imageUrl: "",
  isActive: true,
};

export function ProductForm({ open, product, categories, onClose, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const editing = Boolean(product);
  const leafCategories = categories.filter(
    (c) => !categories.some((other) => other.parentId === c.id),
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      product
        ? {
            code: product.code,
            barcode: product.barcode ?? "",
            name: product.name,
            description: product.description ?? "",
            categoryId: product.categoryId,
            price: String(product.price),
            unit: product.unit,
            soldByWeight: product.soldByWeight,
            stock: String(product.stock),
            lowStockThreshold: String(product.lowStockThreshold),
            discountPercent: String(product.discountPercent),
            isQuickKey: product.isQuickKey,
            imageUrl: product.imageUrl ?? "",
            isActive: product.isActive,
          }
        : BLANK,
    );
  }, [open, product]);

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  const save = async () => {
    setSaving(true);
    setError(null);
    const { stock, ...rest } = form;
    const payload = {
      ...rest,
      price: Number(form.price),
      lowStockThreshold: Number(form.lowStockThreshold),
      discountPercent: Number(form.discountPercent),
    };
    try {
      if (editing) await api.put(`/products/${product.id}`, payload);
      else await api.post("/products", { ...payload, stock: Number(stock) });
      toast.success(
        editing ? "Product updated" : `${form.name} added to the catalog`,
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const valid =
    form.name.trim() &&
    form.code.trim() &&
    form.categoryId &&
    form.price !== "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit product" : "Add product"}
      description={
        editing
          ? "Changes reach registers the next time they refresh the catalog"
          : undefined
      }
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={save}
            loading={saving}
            disabled={!valid}
          >
            {editing ? "Save changes" : "Add product"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="p-name" className="label">
            Product name
          </label>
          <input
            id="p-name"
            className="field"
            value={form.name}
            onChange={set("name")}
            maxLength={120}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="p-code" className="label">
              Quick code
            </label>
            <input
              id="p-code"
              className="field tabular"
              value={form.code}
              onChange={set("code")}
              placeholder="101"
              maxLength={20}
            />
          </div>
          <div>
            <label htmlFor="p-barcode" className="label">
              Barcode (optional)
            </label>
            <input
              id="p-barcode"
              className="field tabular"
              value={form.barcode}
              onChange={set("barcode")}
              placeholder="890123450001"
              maxLength={32}
            />
          </div>
        </div>

        <div>
          <label htmlFor="p-category" className="label">
            Category
          </label>
          <select
            id="p-category"
            className="field"
            value={form.categoryId}
            onChange={set("categoryId")}
          >
            <option value="">Choose a category</option>
            {leafCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {categories.find((p) => p.id === c.parentId)?.name
                  ? `${categories.find((p) => p.id === c.parentId).name} › `
                  : ""}
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="p-price" className="label">
              Price
            </label>
            <input
              id="p-price"
              inputMode="decimal"
              className="field tabular"
              value={form.price}
              onChange={set("price")}
              placeholder="0.00"
            />
          </div>
          <div>
            <label htmlFor="p-unit" className="label">
              Unit
            </label>
            <input
              id="p-unit"
              className="field"
              value={form.unit}
              onChange={set("unit")}
              placeholder="kg, pcs, pack"
              maxLength={12}
            />
          </div>
          <div>
            <label htmlFor="p-markdown" className="label">
              Markdown %
            </label>
            <input
              id="p-markdown"
              inputMode="decimal"
              className="field tabular"
              value={form.discountPercent}
              onChange={set("discountPercent")}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!editing ? (
            <div>
              <label htmlFor="p-stock" className="label">
                Opening stock
              </label>
              <input
                id="p-stock"
                inputMode="decimal"
                className="field tabular"
                value={form.stock}
                onChange={set("stock")}
              />
            </div>
          ) : null}
          <div>
            <label htmlFor="p-low" className="label">
              Warn below
            </label>
            <input
              id="p-low"
              inputMode="decimal"
              className="field tabular"
              value={form.lowStockThreshold}
              onChange={set("lowStockThreshold")}
            />
          </div>
        </div>

        <div>
          <label htmlFor="p-image" className="label">
            Image URL (optional)
          </label>
          <input
            id="p-image"
            className="field"
            value={form.imageUrl}
            onChange={set("imageUrl")}
            placeholder="https://…"
          />
        </div>

        <div className="space-y-2 rounded-lg bg-[#F8F4EE] p-3">
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              checked={form.soldByWeight}
              onChange={set("soldByWeight")}
            />
            <span className="text-body">Sold by weight (opens the scale)</span>
          </label>
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              checked={form.isQuickKey}
              onChange={set("isQuickKey")}
            />
            <span className="text-body">
              Show as a quick key on the register
            </span>
          </label>
          {editing ? (
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                checked={form.isActive}
                onChange={set("isActive")}
              />
              <span className="text-body">Available for sale</span>
            </label>
          ) : null}
        </div>

        {error ? (
          <p
            className="rounded-lg bg-rose-50 px-3 py-2 text-desc text-rose-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
