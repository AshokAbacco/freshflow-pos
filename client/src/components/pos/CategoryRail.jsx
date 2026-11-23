import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuChevronLeft, LuChevronRight, LuLayoutGrid } from "react-icons/lu";

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

  /*
   * The row scrolls sideways, and `no-scrollbar` means there is no bar to say
   * so. Without something, a shop with more categories than fit simply never
   * sees the last few — the row looks like the whole list. These arrows appear
   * only while there is somewhere to go, and the fades show which side.
   */
  const railRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return undefined;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Categories arrive after the first paint, and the panel changes width.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure, categories]);

  // Keep the chosen category on screen, including when it was chosen elsewhere.
  useEffect(() => {
    railRef.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [selected]);

  const nudge = (by) =>
    railRef.current?.scrollBy({ left: by, behavior: "smooth" });

  const ARROW =
    "absolute top-[26px] z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-black/5 transition hover:text-[#FF7B29] lg:grid";

  const Tile = ({ id, label, icon }) => {
    const active = selected === id;
    return (
      <button
        type="button"
        onClick={() => onSelect(id)}
        aria-pressed={active}
        className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 rounded-2xl py-1"
      >
        <span
          className={`grid h-14 w-14 place-items-center rounded-full text-h1 transition ${
            active
              ? "bg-brand-50 ring-2 ring-brand ring-offset-2 ring-offset-[#F8F4EE]"
              : "bg-white shadow-[0_8px_20px_-10px_rgba(0,0,0,0.2)] ring-1 ring-black/5 hover:ring-brand/40"
          }`}
          aria-hidden
        >
          {icon}
        </span>
        <span
          className={`line-clamp-2 text-center text-desc leading-4 ${active ? "font-bold text-brand-700" : "text-slate-600"}`}
        >
          {label}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="relative">
        {edges.left ? (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-10 bg-gradient-to-r from-[#F8F4EE] to-transparent"
              aria-hidden
            />
            <button
              type="button"
              onClick={() => nudge(-240)}
              className={`${ARROW} left-0`}
              aria-label="Scroll categories left"
            >
              <LuChevronLeft aria-hidden />
            </button>
          </>
        ) : null}
        {edges.right ? (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-10 bg-gradient-to-l from-[#F8F4EE] to-transparent"
              aria-hidden
            />
            <button
              type="button"
              onClick={() => nudge(240)}
              className={`${ARROW} right-0`}
              aria-label="Scroll categories right"
            >
              <LuChevronRight aria-hidden />
            </button>
          </>
        ) : null}
        <div
          ref={railRef}
          className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6"
          role="toolbar"
          aria-label="Categories"
        >
          <Tile
            id="all"
            label="All items"
            icon={<LuLayoutGrid className="text-brand" size={22} />}
          />
          {tops.map((c) => (
            <Tile
              key={c.id}
              id={c.id}
              label={c.name}
              icon={c.icon || c.name[0]}
            />
          ))}
        </div>
      </div>
      {subs.length ? (
        <div
          className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
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
                className={`h-8 shrink-0 rounded-full px-3.5 text-desc font-medium transition ${
                  active
                    ? "bg-brand text-white shadow-md shadow-brand/30"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-brand/40"
                }`}
              >
                {s.icon ? `${s.icon} ` : ""}
                {s.name}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
