export function Segmented({ options, value, onChange, size = 'md', className = '', ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`inline-flex rounded-full bg-slate-100 p-1 ${className}`}>
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
            className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition ${
              size === 'sm' ? 'h-7 px-3 text-desc' : 'h-9 px-4 text-body'
            } ${active ? 'bg-white text-slate-900 shadow-card' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {Icon ? <Icon aria-hidden /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
