import { useState } from "react";
import { LuBan, LuReceipt, LuSearch } from "react-icons/lu";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, formatMoney, invoiceLabel } from "../../lib/format";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useDebounce } from "../../hooks/useDebounce";
import { toast } from "../../store/toastStore";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Pagination } from "../ui/Pagination";
import { Segmented } from "../ui/Segmented";
import { EmptyState, ErrorState, Spinner } from "../ui/States";

function VoidDialog({ transaction, onClose, onVoided, currency }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/transactions/${transaction.id}/void`, { reason });
      toast.success(
        `${invoiceLabel(transaction.invoiceNo)} voided and stock returned`,
      );
      onVoided();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Void ${invoiceLabel(transaction.invoiceNo)}`}
      description={`${formatMoney(transaction.grandTotal, currency)} will be removed from sales and the items returned to stock.`}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Keep bill
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={reason.trim().length < 3}
            loading={saving}
            onClick={submit}
          >
            Void bill
          </Button>
        </div>
      }
    >
      <label htmlFor="void-reason" className="label">
        Why is this bill being voided?
      </label>
      <input
        id="void-reason"
        className="field"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Customer returned everything"
        maxLength={200}
        autoFocus
      />
    </Modal>
  );
}

function DetailDialog({ id, onClose, currency }) {
  const { data, loading, error } = useApiQuery(`/transactions/${id}`, null);
  const t = data?.transaction;
  return (
    <Modal
      open
      onClose={onClose}
      title={t ? invoiceLabel(t.invoiceNo) : "Bill"}
      description={t ? formatDateTime(t.soldAt) : undefined}
    >
      {loading ? <Spinner /> : null}
      {error ? <ErrorState message={error} /> : null}
      {t ? (
        <>
          <ul className="divide-y divide-slate-100">
            {t.items.map((i) => (
              <li key={i.id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.productName}</p>
                  <p className="text-desc text-slate-500 tabular">
                    {i.soldByWeight ? i.quantity.toFixed(3) : i.quantity}{" "}
                    {i.unit} × {formatMoney(i.unitPrice, currency)}
                    {i.discountPercent > 0 ? `, −${i.discountPercent}%` : ""}
                  </p>
                </div>
                <span className="font-medium tabular">
                  {formatMoney(i.lineSubtotal - i.lineDiscount, currency)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-body tabular">
            <div className="flex justify-between text-slate-600">
              <dt>Subtotal</dt>
              <dd>{formatMoney(t.subtotal, currency)}</dd>
            </div>
            {t.itemDiscount + t.billDiscount > 0 ? (
              <div className="flex justify-between text-brand-700">
                <dt>
                  Discounts{t.discountReason ? ` (${t.discountReason})` : ""}
                </dt>
                <dd>
                  −{formatMoney(t.itemDiscount + t.billDiscount, currency)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-600">
              <dt>GST {t.taxRate}%</dt>
              <dd>{formatMoney(t.taxTotal, currency)}</dd>
            </div>
            <div className="flex justify-between border-t-2 border-dashed border-gray-200 pt-2 font-extrabold text-gray-900">
              <dt>Total, paid by {t.paymentMethod.toLowerCase()}</dt>
              <dd>{formatMoney(t.grandTotal, currency)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-desc text-slate-500">
            {t.cashier?.name} · {t.terminalId}
            {t.wasOffline ? " · made offline" : ""}
            {t.customerPhone ? ` · ${t.customerPhone}` : ""}
          </p>
          {t.status === "VOIDED" ? (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-desc text-rose-700">
              Voided: {t.voidReason}
            </p>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}

export function TransactionLedger({ range, currency }) {
  const [page, setPage] = useState(1);
  const [method, setMethod] = useState("ALL");
  const [search, setSearch] = useState("");
  const q = useDebounce(search, 250);
  const { data, loading, error, refetch } = useApiQuery("/transactions", {
    from: range.from,
    to: range.to,
    method,
    q,
    page,
    pageSize: 20,
  });

  const [detailId, setDetailId] = useState(null);
  const [voiding, setVoiding] = useState(null);

  const rows = data?.transactions ?? [];

  return (
    <section className="rounded-xl bg-white p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 font-extrabold text-gray-900">Bills</h2>
        <Segmented
          size="sm"
          ariaLabel="Payment method"
          value={method}
          onChange={(v) => {
            setMethod(v);
            setPage(1);
          }}
          options={[
            { value: "ALL", label: "All" },
            { value: "UPI", label: "UPI" },
            { value: "CASH", label: "Cash" },
            { value: "CARD", label: "Card" },
          ]}
        />
        <div className="relative min-w-[180px] flex-1 sm:max-w-[220px]">
          <LuSearch
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            className="field h-9 pl-9"
            placeholder="Invoice or phone"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search bills by invoice number or phone"
          />
        </div>
      </div>

      {loading && !data ? <Spinner /> : null}
      {error ? <ErrorState message={error} onRetry={refetch} /> : null}
      {data && !rows.length ? (
        <EmptyState
          icon={LuReceipt}
          title="No bills in this period"
          description="Sales made on the register appear here as soon as they sync."
        />
      ) : null}

      {rows.length ? (
        <ul className="mt-3 space-y-2 md:hidden">
          {rows.map((t) => (
            <li
              key={t.id}
              className={`rounded-lg p-3 ring-1 ring-black/5 ${t.status === "VOIDED" ? "bg-slate-50" : "bg-white"}`}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setDetailId(t.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="font-bold text-brand-700 tabular">
                    {invoiceLabel(t.invoiceNo)}
                    {t.status === "VOIDED" ? (
                      <span className="ml-1.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-desc text-rose-700">
                        Voided
                      </span>
                    ) : null}
                    {t.wasOffline ? (
                      <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-desc text-slate-500">
                        Offline
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-desc text-slate-500">
                    {formatDateTime(t.soldAt)} · {t.cashier?.name}
                  </p>
                </button>
                <span className="shrink-0 font-extrabold text-gray-900 tabular">
                  {formatMoney(t.grandTotal, currency)}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-desc text-slate-500">
                <span>{t.itemCount} items</span>
                <span>{t.paymentMethod}</span>
                {t.itemDiscount + t.billDiscount > 0 ? (
                  <span className="text-brand-700">
                    −{formatMoney(t.itemDiscount + t.billDiscount, currency)}
                  </span>
                ) : null}
                <div className="flex-1" />
                {t.status === "COMPLETED" ? (
                  <button
                    type="button"
                    onClick={() => setVoiding(t)}
                    className="rounded-full px-2 py-1 font-medium text-rose-600 hover:bg-rose-50"
                  >
                    Void
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {rows.length ? (
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F8F4EE] text-left text-desc text-gray-600">
                <th className="rounded-l-lg py-2.5 pl-3 pr-3 font-semibold">
                  Invoice
                </th>
                <th className="py-2.5 pr-3 font-semibold">Time</th>
                <th className="py-2.5 pr-3 font-semibold">Cashier</th>
                <th className="py-2.5 pr-3 font-semibold">Payment</th>
                <th className="py-2.5 pr-3 text-right font-semibold">Items</th>
                <th className="py-2.5 pr-3 text-right font-semibold">
                  Discount
                </th>
                <th className="py-2.5 pr-3 text-right font-semibold">Total</th>
                <th className="w-8 rounded-r-lg py-2.5" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-slate-50 text-body transition-colors hover:bg-[#FBFAF8] ${t.status === "VOIDED" ? "text-slate-400" : "text-slate-700"}`}
                >
                  <td className="py-2.5 pl-3 pr-3">
                    <button
                      type="button"
                      onClick={() => setDetailId(t.id)}
                      className="font-bold text-brand-700 hover:underline tabular"
                    >
                      {invoiceLabel(t.invoiceNo)}
                    </button>
                    {t.status === "VOIDED" ? (
                      <span className="ml-1.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-desc text-rose-700">
                        Voided
                      </span>
                    ) : null}
                    {t.wasOffline ? (
                      <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-desc text-slate-500">
                        Offline
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3 text-desc tabular">
                    {formatDateTime(t.soldAt)}
                  </td>
                  <td className="max-w-[140px] truncate py-2.5 pr-3 text-desc">
                    {t.cashier?.name}
                  </td>
                  <td className="py-2.5 pr-3 text-desc">{t.paymentMethod}</td>
                  <td className="py-2.5 pr-3 text-right tabular">
                    {t.itemCount}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular">
                    {t.itemDiscount + t.billDiscount > 0
                      ? `−${formatMoney(t.itemDiscount + t.billDiscount, currency)}`
                      : "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-extrabold text-gray-900 tabular">
                    {formatMoney(t.grandTotal, currency)}
                  </td>
                  <td className="py-2.5">
                    {t.status === "COMPLETED" ? (
                      <button
                        type="button"
                        onClick={() => setVoiding(t)}
                        className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Void ${invoiceLabel(t.invoiceNo)}`}
                      >
                        <LuBan aria-hidden />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.total > data.pageSize ? (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPage={setPage}
        />
      ) : null}

      {detailId ? (
        <DetailDialog
          id={detailId}
          currency={currency}
          onClose={() => setDetailId(null)}
        />
      ) : null}
      {voiding ? (
        <VoidDialog
          transaction={voiding}
          currency={currency}
          onClose={() => setVoiding(null)}
          onVoided={refetch}
        />
      ) : null}
    </section>
  );
}
