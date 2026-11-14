export function Segmented({
  options,
  value,
  onChange,
  size = "md",
  className = "",
  ariaLabel,
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex gap-1 rounded-xl border border-surface-line bg-surface-sunk p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-bold transition ${
              size === "sm" ? "h-9 px-3 text-body" : "h-12 px-4 text-h2"
            } ${active ? "bg-ink text-white" : "text-ink-muted hover:bg-white hover:text-ink"}`}
          >
            {Icon ? <Icon aria-hidden /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
