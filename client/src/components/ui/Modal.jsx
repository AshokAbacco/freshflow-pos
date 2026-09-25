import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";

/**
 * Glass overlay. Centered dialog on tablets/desktop, bottom sheet on phones.
 * Escape closes; focus moves into the dialog and returns to the trigger on close.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  initialFocusRef,
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const target =
      initialFocusRef?.current ||
      panelRef.current?.querySelector(
        "input, select, textarea, button:not([data-close])",
      ) ||
      panelRef.current;
    requestAnimationFrame(() => target?.focus?.());

    const onKey = (e) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onClose?.();
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = [
          ...panelRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((el) => !el.disabled);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, dismissible, onClose, initialFocusRef]);

  if (!open) return null;

  const widths = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-lg",
    lg: "sm:max-w-2xl",
    xl: "sm:max-w-4xl",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="presentation"
    >
      <div
        className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[4px]"
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full animate-sheet-in flex-col overflow-hidden rounded-t-2xl border-t-4 border-brand bg-white shadow-glass outline-none sm:rounded-2xl ${widths[size]}`}
      >
        {title ? (
          <header className="flex items-start gap-3 px-5 pb-3 pt-5 sm:px-6">
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="text-h2 font-extrabold tracking-tight text-gray-900"
              >
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-0.5 text-desc text-slate-500">
                  {description}
                </p>
              ) : null}
            </div>
            {dismissible ? (
              <button
                type="button"
                data-close
                onClick={onClose}
                className="-mr-1 grid h-8 w-8 place-items-center rounded-full bg-[#F8F4EE] text-gray-600 transition hover:bg-[#FF7B29] hover:text-white"
                aria-label="Close"
              >
                <LuX />
              </button>
            ) : null}
          </header>
        ) : null}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
          {children}
        </div>
        {footer ? (
          <footer className="border-t border-black/5 bg-[#FBFAF8] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
