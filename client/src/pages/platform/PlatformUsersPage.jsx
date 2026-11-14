import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LuMail, LuPhone, LuPower } from "react-icons/lu";
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
  ROLE_LABEL,
  sinceNow,
  telHref,
  when,
} from "../../lib/platformFormat.js";
import { usePlatformAuthStore } from "../../store/platformAuthStore.js";

/*
 * Every staff account on the platform, for the call that starts "I can't get in".
 *
 * The only action here is turning an account off or back on, and it is the real thing: the
 * store API re-reads isActive on every request, so a disabled cashier is refused on their next
 * tap even with a token already in hand. There is deliberately no "send reset link" button --
 * store users have no password-token table, so it could not do anything.
 */

export default function PlatformUsersPage() {
  const admin = usePlatformAuthStore((s) => s.admin);
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(params.get("q") ?? "");
  const [pending, setPending] = useState(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  const isSuper = admin?.role === "SUPER_ADMIN";
  const query = params.toString();

  useEffect(() => {
    setDraft(params.get("q") ?? "");
  }, [params]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await platformApi.get(`/users?${query}`);
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, "Could not load the users."));
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

  const submit = async (event) => {
    event.preventDefault();
    if (reason.trim().length < 5) return;
    setWorking(true);
    setError(null);
    try {
      await platformApi.post(`/users/${pending.user.id}/set-active`, {
        isActive: pending.next,
        reason: reason.trim(),
      });
      setPending(null);
      setReason("");
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, "That change did not go through."));
    } finally {
      setWorking(false);
    }
  };

  const users = data?.users ?? [];
  const page = Number(params.get("page") ?? 1);
  const activeFilters = [...params.entries()].filter(([k]) => k !== "page");

  return (
    <Page
      wide
      title="Users"
      subtitle={
        loading && !data
          ? "Loading…"
          : `${(data?.total ?? 0).toLocaleString("en-IN")} staff accounts across every store`
      }
      actions={<ReloadButton onClick={load} busy={loading} />}
    >
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchBox
          value={draft}
          onChange={setDraft}
          onSubmit={() => setFilter("q", draft.trim())}
          placeholder="Name, email, phone number or store"
          label="Search users"
        />
        <Select
          label="Role"
          value={params.get("role")}
          onChange={(v) => setFilter("role", v)}
          options={[
            { value: "ADMIN", label: "Owner" },
            { value: "CASHIER", label: "Cashier" },
          ]}
          any="Any role"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip
          on={params.get("isActive") === "false"}
          onClick={() =>
            setFilter(
              "isActive",
              params.get("isActive") === "false" ? "" : "false",
            )
          }
        >
          Disabled only
        </Chip>
        <Chip
          on={params.get("isActive") === "true"}
          onClick={() =>
            setFilter(
              "isActive",
              params.get("isActive") === "true" ? "" : "true",
            )
          }
        >
          Active only
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
          <Loading what="Loading users" />
        ) : !users.length ? (
          <Empty title="No users match this">
            {activeFilters.length
              ? "Try a different search."
              : "Staff accounts appear here."}
          </Empty>
        ) : (
          <>
            <table className="hidden w-full text-left lg:table">
              <TableHead>
                <Th>Name</Th>
                <Th>Store</Th>
                <Th>Role</Th>
                <Th>Contact</Th>
                <Th>Last signed in</Th>
                <Th>Joined</Th>
                {isSuper ? <Th align="right">Access</Th> : null}
              </TableHead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-slate-900">{u.name}</p>
                      {!u.isActive ? (
                        <Pill className="bg-slate-100 text-slate-500">
                          disabled
                        </Pill>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {u.store ? (
                        <Link
                          to={`/platform/stores/${u.store.id}`}
                          className="text-body text-slate-700 hover:text-brand-700 hover:underline"
                        >
                          {u.store.name}
                        </Link>
                      ) : (
                        <span className="text-body text-slate-400">—</span>
                      )}
                      <p className="text-desc text-slate-400">
                        {u.store?.city ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-body text-slate-700">
                      {ROLE_LABEL[u.role] ?? u.role}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {u.phone ? (
                          <a
                            href={telHref(u.phone)}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                            title={u.phone}
                            aria-label={`Call ${u.name}`}
                          >
                            <LuPhone size={13} aria-hidden />
                          </a>
                        ) : null}
                        <a
                          href={`mailto:${u.email}`}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                          title={u.email}
                          aria-label={`Email ${u.name}`}
                        >
                          <LuMail size={13} aria-hidden />
                        </a>
                      </div>
                    </td>
                    <td
                      className="px-4 py-2.5 text-body text-slate-500"
                      title={when(u.lastLoginAt)}
                    >
                      {sinceNow(u.lastLoginAt)}
                    </td>
                    <td className="px-4 py-2.5 text-body text-slate-500">
                      {when(u.createdAt)}
                    </td>
                    {isSuper ? (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setPending({ user: u, next: !u.isActive });
                            setReason("");
                          }}
                          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-desc font-semibold transition ${
                            u.isActive
                              ? "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                              : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          <LuPower size={13} aria-hidden />
                          {u.isActive ? "Disable" : "Enable"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-slate-100 lg:hidden">
              {users.map((u) => (
                <li key={u.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-body font-bold text-slate-900">
                        {u.name}
                      </p>
                      <p className="truncate text-desc text-slate-500">
                        {ROLE_LABEL[u.role] ?? u.role}
                        {u.store ? ` · ${u.store.name}` : ""}
                      </p>
                    </div>
                    {!u.isActive ? (
                      <Pill className="bg-slate-100 text-slate-500">
                        disabled
                      </Pill>
                    ) : null}
                  </div>
                  <p className="mt-1 text-desc text-slate-500">
                    Last signed in {sinceNow(u.lastLoginAt)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Pagination
        page={page}
        pageSize={data?.pageSize ?? 50}
        total={data?.total ?? 0}
        busy={loading}
        onPage={(p) => setFilter("page", p)}
      />

      {pending ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div
            className="absolute inset-0 animate-fade-in bg-slate-900/50"
            onClick={() => !working && setPending(null)}
            aria-hidden
          />
          <form
            onSubmit={submit}
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md animate-sheet-in rounded-t-2xl bg-white p-4 shadow-lift sm:rounded-2xl"
          >
            <h2 className="text-h2 font-bold text-slate-900">
              {pending.next ? "Enable" : "Disable"} {pending.user.name}
            </h2>
            <p
              className={`mt-2 rounded-lg p-3 text-body ${
                pending.next
                  ? "bg-slate-50 text-slate-600"
                  : "bg-rose-50 text-rose-800"
              }`}
            >
              {pending.next
                ? "They will be able to sign in again straight away."
                : "They stop being able to use the till on their very next tap, even if they are signed in right now."}
            </p>

            <label
              htmlFor="user-reason"
              className="mt-3 block text-desc font-semibold text-slate-500"
            >
              Why?
            </label>
            <textarea
              id="user-reason"
              rows={3}
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Goes on the audit log, e.g. “Left the business on 10 Nov, owner asked us to remove access”"
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={working}
                className="h-11 flex-1 rounded-lg border border-slate-200 text-body font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Keep as it is
              </button>
              <button
                type="submit"
                disabled={reason.trim().length < 5 || working}
                className={`h-11 flex-1 rounded-lg text-body font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  pending.next
                    ? "bg-brand text-ink hover:bg-brand-700"
                    : "bg-rose-600 text-white hover:bg-rose-700"
                }`}
              >
                {working ? "Working…" : pending.next ? "Enable" : "Disable"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </Page>
  );
}
