import { forwardRef } from "react";
import { LuLoaderCircle } from "react-icons/lu";

const VARIANTS = {
  primary:
    "bg-brand text-white shadow-md shadow-brand/25 hover:bg-brand-700 active:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none",
  secondary:
    "bg-white text-gray-900 border border-gray-200 hover:border-brand/50 hover:bg-[#FBFAF8] active:bg-slate-100 disabled:text-slate-400",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200 disabled:bg-slate-100 disabled:text-slate-400",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200 disabled:text-slate-300",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 disabled:bg-slate-200 disabled:text-slate-400",
  dangerSoft:
    "bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:text-slate-400",
};

const SIZES = {
  sm: "h-8 px-3 gap-1.5 text-desc",
  md: "h-10 px-4 gap-2 text-body",
  lg: "h-12 px-6 gap-2 text-h2",
  icon: "h-10 w-10 justify-center",
  iconSm: "h-8 w-8 justify-center",
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
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-lg font-bold transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
