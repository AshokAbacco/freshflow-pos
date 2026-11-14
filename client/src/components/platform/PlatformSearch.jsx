import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuBuilding2,
  LuCreditCard,
  LuLoaderCircle,
  LuSearch,
  LuUser,
} from "react-icons/lu";
import { platformApi } from "../../lib/platformApi.js";
import { BUSINESS_LABEL, ROLE_LABEL, inr } from "../../lib/platformFormat.js";

/**
 * One box for the whole panel.
 *
 * A support call starts with whatever the caller has to hand -- a shop name, a phone number,
 * or an order id pasted from an email -- so this takes all three and groups what it finds.
 * "Sri Lakshmi" meaning a store and "Sri Lakshmi" meaning its owner are different answers to
 * the same question, and the operator has to be the one to choose.
 */

const GROUPS = [
  { key: "stores", label: "Stores", icon: LuBuilding2 },
  { key: "users", label: "People", icon: LuUser },
  { key: "payments", label: "Payments", icon: LuCreditCard },
];

export default function PlatformSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);

  /*
   * Debounced, and each request supersedes the last. Without the abort, a slow response for
   * "sri" can land after the response for "sri lak" and replace newer results with older ones.
   */
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults(null);
      setBusy(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const response = await platformApi.get("/search", {
          params: { q },
          signal: controller.signal,
        });
        setResults(response.data);
        setCursor(-1);
      } catch {
        // An aborted request is the normal case here, and a failed search should not shout.
      } finally {
        setBusy(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  // Click outside closes. Cmd/Ctrl-K focuses, because this is the box people live in.
  useEffect(() => {
    const onClick = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  /** One flat list of what is on screen, so the arrow keys can walk across the groups. */
  const flat = [];
  if (results) {
    for (const group of GROUPS) {
      for (const item of results[group.key] ?? [])
        flat.push({ group: group.key, item });
    }
  }

  const go = (entry) => {
    const storeId =
      entry.group === "stores" ? entry.item.id : entry.item.storeId;
    setOpen(false);
    setTerm("");
    setResults(null);
    navigate(`/platform/stores/${storeId}`);
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!flat.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (c + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (c <= 0 ? flat.length - 1 : c - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(flat[cursor >= 0 ? cursor : 0]);
    }
  };

  const nothing =
    results && flat.length === 0 && term.trim().length >= 2 && !busy;

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <LuSearch
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && Boolean(results)}
        aria-controls={listId}
        aria-autocomplete="list"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search stores, people, payments"
        aria-label="Search the platform"
        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
      />
      {busy ? (
        <LuLoaderCircle
          size={15}
          className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400"
          aria-hidden
        />
      ) : null}

      {open && (results || nothing) ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lift"
        >
          {nothing ? (
            <p className="p-4 text-center text-body text-slate-500">
              Nothing matched “{term.trim()}”.
            </p>
          ) : null}

          {GROUPS.map(({ key, label, icon: Icon }) => {
            const items = results?.[key] ?? [];
            if (!items.length) return null;
            return (
              <div key={key} className="mb-1 last:mb-0">
                <p className="px-2 py-1 text-desc font-semibold text-slate-400">
                  {label}
                </p>
                <ul>
                  {items.map((item) => {
                    const index = flat.findIndex(
                      (f) => f.group === key && f.item.id === item.id,
                    );
                    const active = index === cursor;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setCursor(index)}
                          onClick={() => go({ group: key, item })}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition ${
                            active ? "bg-slate-100" : "hover:bg-slate-50"
                          }`}
                        >
                          <Icon
                            size={15}
                            className="shrink-0 text-slate-400"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body font-semibold text-slate-900">
                              {key === "stores" ? item.name : null}
                              {key === "users" ? item.name : null}
                              {key === "payments"
                                ? inr(item.amount, item.currency)
                                : null}
                            </span>
                            <span className="block truncate text-desc text-slate-500">
                              {key === "stores"
                                ? [
                                    BUSINESS_LABEL[item.businessType] ??
                                      item.businessType,
                                    item.city,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")
                                : null}
                              {key === "users"
                                ? `${ROLE_LABEL[item.role] ?? item.role} at ${item.storeName}${
                                    item.phone ? ` · ${item.phone}` : ""
                                  }`
                                : null}
                              {key === "payments"
                                ? `${item.status.toLowerCase()} · ${item.storeName} · ${
                                    item.paymentId ?? item.orderId
                                  }`
                                : null}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
