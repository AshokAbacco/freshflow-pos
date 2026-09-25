import { useState } from "react";
import { LuChevronRight, LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../store/toastStore";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { EmptyState } from "../ui/States";

const SUGGESTED_ICONS = [
  "🥩",
  "🐟",
  "🍗",
  "🥦",
  "🍎",
  "🥛",
  "🍞",
  "🌾",
  "🥤",
  "🧴",
  "🧹",
  "✏️",
  "🧊",
  "🍫",
];

function CategoryForm({
  open,
  category,
  parent,
  categories,
  onClose,
  onSaved,
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  if (open && !ready) {
    setName(category?.name ?? "");
    setIcon(category?.icon ?? "");
    setParentId(category?.parentId ?? parent?.id ?? "");
    setError(null);
    setReady(true);
  }
  if (!open && ready) setReady(false);

  const tops = categories.filter((c) => !c.parentId && c.id !== category?.id);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        name,
        icon,
        parentId: parentId || null,
        sortOrder: category?.sortOrder ?? 0,
      };
      if (category) await api.put(`/categories/${category.id}`, body);
      else await api.post("/categories", body);
      toast.success(category ? "Category updated" : `${name} added`);
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
      open={open}
      onClose={onClose}
      size="sm"
      title={
        category
          ? "Edit category"
          : parent
            ? `Add under ${parent.name}`
            : "Add category"
      }
      footer={
        <Button
          className="w-full"
          onClick={save}
          loading={saving}
          disabled={name.trim().length < 1}
        >
          {category ? "Save changes" : "Add category"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="cat-name" className="label">
            Name
          </label>
          <input
            id="cat-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Meat"
            maxLength={60}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="cat-icon" className="label">
            Icon shown on the register
          </label>
          <input
            id="cat-icon"
            className="field"
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 4))}
            placeholder="🥩"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={`grid h-9 w-9 place-items-center rounded-xl text-h2 transition ${icon === emoji ? "bg-brand-50 ring-2 ring-brand" : "bg-[#F8F4EE] hover:bg-[#F1ECE4]"}`}
                aria-label={`Use ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="cat-parent" className="label">
            Sits under
          </label>
          <select
            id="cat-parent"
            className="field"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">Top level department</option>
            {tops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ""}
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-desc text-slate-500">
            Departments can hold sub-categories one level deep.
          </p>
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

/** Admin screen for building the category tree, e.g. adding Meat with Poultry under it. */
export function CategoryManager({ open, onClose, categories, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [addingUnder, setAddingUnder] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const tops = categories.filter((c) => !c.parentId);
  const childrenOf = (id) => categories.filter((c) => c.parentId === id);

  const remove = async (category) => {
    try {
      await api.delete(`/categories/${category.id}`);
      toast.success(`${category.name} removed`);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConfirmDelete(null);
    }
  };

  const Row = ({ category, nested }) => (
    <li className={`flex items-center gap-2 py-2 ${nested ? "pl-7" : ""}`}>
      {nested ? (
        <LuChevronRight className="shrink-0 text-slate-300" aria-hidden />
      ) : null}
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F8F4EE] text-h2 ring-1 ring-black/5"
        aria-hidden
      >
        {category.icon || category.name[0]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-gray-900">{category.name}</p>
        <p className="text-desc text-slate-500">
          {category.productCount ?? 0} product
          {category.productCount === 1 ? "" : "s"}
        </p>
      </div>
      {!nested ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setAddingUnder(category)}
        >
          <LuPlus aria-hidden /> <span className="hidden sm:inline">Sub</span>
        </Button>
      ) : null}
      <Button
        size="iconSm"
        variant="ghost"
        aria-label={`Edit ${category.name}`}
        onClick={() => setEditing(category)}
      >
        <LuPencil aria-hidden />
      </Button>
      {confirmDelete === category.id ? (
        <Button size="sm" variant="danger" onClick={() => remove(category)}>
          Confirm
        </Button>
      ) : (
        <Button
          size="iconSm"
          variant="ghost"
          aria-label={`Delete ${category.name}`}
          onClick={() => setConfirmDelete(category.id)}
        >
          <LuTrash2 aria-hidden />
        </Button>
      )}
    </li>
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Categories"
        description="Group what you sell. Cashiers browse these on the register."
        footer={
          <Button className="w-full" onClick={() => setCreating(true)}>
            <LuPlus aria-hidden /> Add category
          </Button>
        }
      >
        {tops.length ? (
          <ul className="divide-y divide-slate-100">
            {tops.map((top) => (
              <li key={top.id}>
                <ul className="divide-y divide-slate-50">
                  <Row category={top} />
                  {childrenOf(top.id).map((child) => (
                    <Row key={child.id} category={child} nested />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No categories yet"
            description="Add your first one, such as Meat, Vegetables or Dairy."
          />
        )}
      </Modal>

      <CategoryForm
        open={creating}
        category={null}
        parent={null}
        categories={categories}
        onClose={() => setCreating(false)}
        onSaved={onChanged}
      />
      <CategoryForm
        open={Boolean(addingUnder)}
        category={null}
        parent={addingUnder}
        categories={categories}
        onClose={() => setAddingUnder(null)}
        onSaved={onChanged}
      />
      <CategoryForm
        open={Boolean(editing)}
        category={editing}
        parent={null}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={onChanged}
      />
    </>
  );
}
