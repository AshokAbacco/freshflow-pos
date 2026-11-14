import { useMemo } from "react";
import { LuLayoutGrid } from "react-icons/lu";

/*
 * One scrolling row of pills rather than a grid of icon tiles. The tiles cost ~100px of vertical
 * space at the top of the register — space that is worth about two more rows of products — and a
 * 56px circle is no easier to hit than a 44px pill that also shows its full name.
 */
export function CategoryRail({
  categories,
  selected,
  onSelect,
  selectedSub,
  onSelectSub,
}) {
  const { tops, childrenOf } = useMemo(() => {
    const map = new Map();
    const topList = [];
    for (const c of categories) {
      if (c.parentId) {
        if (!map.has(c.parentId)) map.set(c.parentId, []);
        map.get(c.parentId).push(c);
      } else topList.push(c);
    }
    return { tops: topList, childrenOf: map };
  }, [categories]);

  const subs = selected !== "all" ? childrenOf.get(selected) || [] : [];

  return (
    <div>
      <div
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
        role="toolbar"
        aria-label="Categories"
      >
        {[{ id: "all", name: "All items", icon: null }, ...tops].map((c) => {
          const active = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              aria-pressed={active}
              className={`inline-flex h-tap shrink-0 items-center gap-2 rounded-xl border px-3.5 text-body font-bold transition ${
                active
                  ? "border-ink bg-ink text-white"
                  : "border-surface-line bg-white text-ink-soft hover:border-brand hover:bg-brand-50/50"
              }`}
            >
              <span aria-hidden className="text-h2 leading-none">
                {c.icon ||
                  (c.id === "all" ? <LuLayoutGrid size={18} /> : c.name[0])}
              </span>
              {c.name}
            </button>
          );
        })}
      </div>

      {subs.length ? (
        <div
          className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
          role="toolbar"
          aria-label="Sub-categories"
        >
          {[{ id: "all", name: "All" }, ...subs].map((s) => {
            const active = selectedSub === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSub(s.id)}
                aria-pressed={active}
                className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-desc font-bold transition ${
                  active
                    ? "border-brand bg-brand text-ink"
                    : "border-surface-line bg-white text-ink-muted hover:border-brand-300"
                }`}
              >
                {s.icon ? <span aria-hidden>{s.icon}</span> : null}
                {s.name}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
