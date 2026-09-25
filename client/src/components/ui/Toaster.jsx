import {
  LuCircleAlert,
  LuCircleCheck,
  LuInfo,
  LuTriangleAlert,
} from "react-icons/lu";
import { useToastStore } from "../../store/toastStore";

const TONES = {
  neutral: { icon: LuInfo, className: "text-white/70" },
  success: { icon: LuCircleCheck, className: "text-brand" },
  warn: { icon: LuTriangleAlert, className: "text-[#FF7B29]" },
  error: { icon: LuCircleAlert, className: "text-rose-400" },
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const { icon: Icon, className } = TONES[t.tone] || TONES.neutral;
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto flex max-w-md animate-sheet-in items-center gap-2.5 rounded-full bg-[#111] py-2.5 pl-3.5 pr-4 text-left text-body font-medium text-white shadow-lift"
          >
            <Icon className={`shrink-0 ${className}`} aria-hidden />
            <span>{t.message}</span>
          </button>
        );
      })}
    </div>
  );
}
