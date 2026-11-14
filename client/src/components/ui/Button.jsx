import { forwardRef } from "react";
import { LuLoaderCircle } from "react-icons/lu";

/*
 * Filled orange carries an ink label, not white: white on #FF7B29 is 2.59:1 and unreadable
 * under the strip lighting most registers sit under. Ink on the same orange is 7.19:1.
 */
const VARIANTS = {
  primary:
    "bg-brand text-ink hover:bg-brand-600 active:bg-brand-700 active:text-white disabled:bg-surface-sunk disabled:text-ink-faint",
  secondary:
    "bg-white text-ink-soft border border-surface-line hover:bg-surface-sunk active:bg-surface-line disabled:text-ink-faint",
  soft: "bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200 disabled:bg-surface-sunk disabled:text-ink-faint",
  ghost:
    "bg-transparent text-ink-muted hover:bg-surface-sunk active:bg-surface-line disabled:text-ink-faint",
  dark: "bg-ink text-white hover:bg-ink-soft active:bg-black disabled:bg-surface-sunk disabled:text-ink-faint",
  danger:
    "bg-stock-out text-white hover:bg-[#9A1C12] active:bg-[#7F1710] disabled:bg-surface-sunk disabled:text-ink-faint",
  dangerSoft:
    "bg-stock-outBg text-stock-out hover:bg-[#FDE3E0] disabled:text-ink-faint",
};

/* Nothing a finger has to hit during a sale is under 44px. */
const SIZES = {
  sm: "h-10 px-3.5 gap-1.5 text-body",
  md: "h-tap px-4 gap-2 text-body",
  lg: "h-14 px-6 gap-2 text-h2",
  icon: "h-tap w-tap justify-center",
  iconSm: "h-10 w-10 justify-center",
};

export const Button = forwardRef(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    className = "",
    children,
    disabled,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-xl font-bold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
