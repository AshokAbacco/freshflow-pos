import { LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "./Button";

export function Spinner({ label = "Loading" }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-10 text-body text-ink-muted"
      role="status"
    >
      <LuLoaderCircle className="animate-spin text-brand-700" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon ? (
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-800">
          <Icon size={22} aria-hidden />
        </div>
      ) : null}
      <h3 className="text-ink">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-xs text-desc text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <LuCircleAlert className="text-stock-out" size={22} aria-hidden />
      <p className="max-w-sm text-body text-ink-soft">{message}</p>
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
    <div className={`animate-pulse rounded-xl bg-surface-sunk ${className}`} />
  );
}
