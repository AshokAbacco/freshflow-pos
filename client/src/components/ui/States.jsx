import { LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "./Button";

export function Spinner({ label = "Loading" }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-10 text-body text-slate-500"
      role="status"
    >
      <LuLoaderCircle className="animate-spin text-brand" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon ? (
        <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand ring-8 ring-brand-50/50">
          <Icon size={22} aria-hidden />
        </div>
      ) : null}
      <h3 className="font-extrabold text-gray-900">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-xs text-desc text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-500">
        <LuCircleAlert size={22} aria-hidden />
      </span>
      <p className="max-w-sm text-body text-slate-700">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-xl bg-black/[0.06] ${className}`} />
  );
}
