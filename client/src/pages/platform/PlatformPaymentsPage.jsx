import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LuShieldOff, LuTriangleAlert } from "react-icons/lu";
import {
  Card,
  Chip,
  ClearFilters,
  Empty,
  ErrorNote,
  Loading,
  Page,
  Pagination,
  Pill,
  ReloadButton,
  SearchBox,
  Select,
  TableHead,
  Th,
} from "../../components/platform/ui.jsx";
import { platformApi, platformErrorMessage } from "../../lib/platformApi.js";
import {
  PAYMENT_STYLE,
  inr,
  when,
  whenExact,
} from "../../lib/platformFormat.js";

/*
 * Every charge, and whether it actually landed.
 *
 * The column that earns its place is "captured". A payment marked PAID whose captured amount
 * is missing or different is a plan activated on money that never fully arrived -- it will not
 * show up in the subscription, the store will look fine, and nobody finds out. That is what
 * the mismatch filter is for.
 */

export default function PlatformPaymentsPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(params.get("q") ?? "");

  const query = params.toString();

  useEffect(() => {
    setDraft(params.get("q") ?? "");
  }, [params]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await platformApi.get(`/payments?${query}`);
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, "Could not load the payments."));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = useCallback(
    (key, value) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!value) next.delete(key);
          else next.set(key, String(value));
          if (key !== "page") next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const payments = data?.payments ?? [];
  const page = Number(params.get("page") ?? 1);
  const activeFilters = [...params.entries()].filter(([k]) => k !== "page");
  const mismatches = payments.filter((p) => p.mismatch).length;

  return (
    <Page
      wide
      title="Payments"
      subtitle={
        loading && !data
          ? "Loading…"
          : `${inr(data.summary.collected)} collected across ${data.summary.paidCount} successful payments${
              data.summary.refunded
                ? `, ${inr(data.summary.refunded)} refunded`
                : ""
            }`
      }
      actions={<ReloadButton onClick={load} busy={loading} />}
    >
      {mismatches && params.get("mismatched") !== "true" ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-body text-amber-900">
          <LuTriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span className="flex-1">
            {mismatches} payment{mismatches === 1 ? " is" : "s are"} marked paid
            but the captured amount does not match what was charged.
          </span>
          <button
            type="button"
            onClick={() => setFilter("mismatched", "true")}
            className="shrink-0 font-semibold underline"
          >
            Show them
          </button>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchBox
          value={draft}
          onChange={setDraft}
          onSubmit={() => setFilter("q", draft.trim())}
          placeholder="Order id, payment id or store"
          label="Search payments"
        />
        <Select
          label="Status"
          value={params.get("status")}
          onChange={(v) => setFilter("status", v)}
          options={[
            { value: "PAID", label: "Paid" },
            { value: "FAILED", label: "Failed" },
            { value: "CREATED", label: "Started, never finished" },
          ]}
          any="Any status"
        />
        <Select
          label="Plan"
          value={params.get("plan")}
          onChange={(v) => setFilter("plan", v)}
          options={[
            { value: "STANDARD", label: "Standard" },
            { value: "CUSTOM", label: "Custom" },
          ]}
          any="Any plan"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip
          on={params.get("mismatched") === "true"}
          tone="warn"
          onClick={() =>
            setFilter(
              "mismatched",
              params.get("mismatched") === "true" ? "" : "true",
            )
          }
        >
          Captured ≠ charged
        </Chip>
        <Chip
          on={params.get("status") === "FAILED"}
          tone="danger"
          onClick={() =>
            setFilter(
              "status",
              params.get("status") === "FAILED" ? "" : "FAILED",
            )
          }
        >
          Failed
        </Chip>
        {activeFilters.length ? (
          <ClearFilters
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          />
        ) : null}
      </div>

      <ErrorNote message={error} onRetry={load} />

      <Card>
        {loading && !data ? (
          <Loading what="Loading payments" />
        ) : !payments.length ? (
          <Empty title="No payments match this">
            {activeFilters.length
              ? "Try removing a filter."
              : "Charges appear here as they happen."}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left">
              <TableHead>
                <Th>When</Th>
                <Th>Store</Th>
                <Th align="right">Charged</Th>
                <Th align="right">Captured</Th>
                <Th>Status</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
              </TableHead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b border-slate-100 last:border-0 ${
                      p.mismatch ? "bg-amber-50/50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td
                      className="px-4 py-2.5 text-body text-slate-600"
                      title={whenExact(p.createdAt)}
                    >
                      {when(p.paidAt ?? p.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      {p.store ? (
                        <Link
                          to={`/platform/stores/${p.store.id}`}
                          className="text-body font-semibold text-slate-800 hover:text-brand-700 hover:underline"
                        >
                          {p.store.name}
                        </Link>
                      ) : (
                        <span className="text-body text-slate-400">—</span>
                      )}
                      <p className="text-desc text-slate-400">
                        {p.plan} · {p.seats} seats
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right text-body text-slate-900">
                      {inr(p.amount, p.currency)}
                      {p.amountRefunded > 0 ? (
                        <span className="block text-desc text-slate-500">
                          {inr(p.amountRefunded, p.currency)} refunded
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right text-body">
                      {p.amountCaptured === null ? (
                        <span
                          className={
                            p.mismatch
                              ? "font-semibold text-amber-800"
                              : "text-slate-400"
                          }
                        >
                          {p.status === "PAID" ? "nothing" : "—"}
                        </span>
                      ) : (
                        <span
                          className={
                            p.mismatch
                              ? "font-semibold text-amber-800"
                              : "text-slate-700"
                          }
                        >
                          {inr(p.amountCaptured, p.currency)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Pill className={PAYMENT_STYLE[p.status]}>
                        {p.status.toLowerCase()}
                      </Pill>
                      {p.failureReason ? (
                        <span className="block text-desc text-rose-700">
                          {p.failureReason}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-body text-slate-600">
                      {p.method ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-desc text-slate-500">
                        {p.paymentId ?? p.orderId}
                      </span>
                      {/* No stored signature means we cannot prove this handover came from
                          Razorpay, which matters if the charge is ever disputed. */}
                      {p.status === "PAID" && !p.hasSignature ? (
                        <span
                          className="ml-1 inline-flex items-center gap-1 text-desc text-amber-700"
                          title="No Razorpay signature stored for this payment"
                        >
                          <LuShieldOff size={12} aria-hidden />
                          unsigned
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination
        page={page}
        pageSize={data?.pageSize ?? 50}
        total={data?.total ?? 0}
        busy={loading}
        onPage={(p) => setFilter("page", p)}
      />

      <p className="mt-3 text-desc text-slate-400">
        Refunds are issued in Razorpay, not here. This screen reports and
        reconciles.
      </p>
    </Page>
  );
}
