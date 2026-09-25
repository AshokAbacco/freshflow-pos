import { useState } from "react";
import { LuCheck, LuMinus, LuPlus } from "react-icons/lu";
import { formatMoney } from "../../lib/format";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";

const monthsFor = (interval) => (interval === "YEARLY" ? 12 : 1);

export function SeatStepper({
  seats,
  onChange,
  min = 1,
  max = 500,
  label = "Staff accounts",
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-body font-semibold text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, seats - 1))}
          disabled={seats <= min}
          className="grid h-9 w-9 place-items-center rounded-full bg-[#F1ECE4] text-gray-700 transition hover:bg-[#E8E0D4] disabled:opacity-40"
          aria-label="One less staff account"
        >
          <LuMinus aria-hidden />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={seats}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ""));
            onChange(Math.max(min, Math.min(max, n || min)));
          }}
          className="h-9 w-14 rounded-lg border border-gray-200 text-center font-extrabold tabular focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          aria-label="Number of staff accounts"
        />
        <button
          type="button"
          onClick={() => onChange(Math.min(max, seats + 1))}
          disabled={seats >= max}
          className="grid h-9 w-9 place-items-center rounded-full bg-brand text-white transition hover:bg-brand-700 disabled:opacity-40"
          aria-label="One more staff account"
        >
          <LuPlus aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function PlanCard({
  plan,
  interval,
  seats,
  currency = "INR",
  highlight,
  cta,
  onSelect,
  busy,
  currentLabel,
}) {
  const rate = plan.intervals[interval];
  const months = monthsFor(interval);
  const total = rate.price * seats * months;
  const saving = (rate.listPrice - rate.price) * seats * months;

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl bg-white p-6 transition hover:-translate-y-1 ${
        highlight
          ? "shadow-lift ring-2 ring-brand"
          : "shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5"
      }`}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">
          {plan.name}
        </h2>
        {highlight ? (
          <span className="rounded bg-[#FF7B29] px-2 py-0.5 text-[11px] font-bold text-white">
            Most popular
          </span>
        ) : null}
        {currentLabel ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-desc font-semibold text-slate-600">
            {currentLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-desc text-slate-500">{plan.blurb}</p>

      <div className="mt-4 flex items-end gap-2">
        <span className="text-4xl font-extrabold tracking-tight text-[#FF7B29] tabular">
          {formatMoney(rate.price, currency)}
        </span>
        <span className="pb-0.5 text-desc text-slate-500">
          per user / month
        </span>
      </div>
      <p className="mt-0.5 text-desc text-slate-400">
        <span className="line-through tabular">
          {formatMoney(rate.listPrice, currency)}
        </span>{" "}
        before the launch discount
      </p>

      <div className="mt-4 rounded-lg bg-[#F8F4EE] p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-desc text-slate-600">
            {seats} user{seats === 1 ? "" : "s"},{" "}
            {interval === "YEARLY" ? "billed yearly" : "billed monthly"}
          </span>
          <span className="text-h2 font-extrabold text-gray-900 tabular">
            {formatMoney(total, currency)}
          </span>
        </div>
        {saving > 0 ? (
          <p className="mt-1 text-desc font-semibold text-brand-700 tabular">
            You save {formatMoney(saving, currency)}
          </p>
        ) : null}
      </div>

      <ul className="mt-4 flex-1 space-y-2">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2 text-body text-slate-700">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-brand">
              <LuCheck size={12} aria-hidden />
            </span>
            {f}
          </li>
        ))}
      </ul>

      <Button
        className="mt-5 w-full"
        size="lg"
        variant={highlight ? "primary" : "secondary"}
        onClick={() => onSelect?.(plan.tier)}
        loading={busy}
      >
        {cta}
      </Button>
    </div>
  );
}

export function IntervalToggle({ interval, onChange }) {
  return (
    <Segmented
      ariaLabel="Billing interval"
      value={interval}
      onChange={onChange}
      options={[
        { value: "MONTHLY", label: "Monthly" },
        { value: "YEARLY", label: "Yearly, save more" },
      ]}
    />
  );
}

export function usePlanSelection(defaultSeats = 3) {
  const [interval, setInterval] = useState("MONTHLY");
  const [seats, setSeats] = useState(defaultSeats);
  return { interval, setInterval, seats, setSeats };
}
