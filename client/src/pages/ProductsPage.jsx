// ==============================================
// src/pages/ProductsPage.jsx
// ==============================================
//
// The hardware catalogue.
//
// All copy, categories and specifications come from lib/products.config.js.
// All photos come from lib/products.images.js. Nothing is written in here,
// so adding a product never means touching this file.
//

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LuChevronLeft,
  LuChevronRight,
  LuImage,
  LuImages,
  LuPhone,
  LuSearch,
  LuX,
} from "react-icons/lu";
import { CtaBand, PageIntro, SiteLayout } from "../components/site/SiteFooter";
import { CARD } from "../components/site/theme";
import {
  PRODUCTS,
  PRODUCTS_PAGE,
  PRODUCT_CATEGORIES,
  PRODUCT_CONTACT,
  categoryLabel,
  whatsappLink,
  callLink,
} from "../lib/products.config";
import { altSrc } from "../lib/products.images";

// ----------------------------------------------
// The banner shape
// ----------------------------------------------
// The product photos are designed banners — the model name, the badges and
// the feature icons are part of the artwork, and the background bleeds to
// the edge. So they fill the top of the card edge to edge rather than
// sitting on a tint, and nothing is blended out of them.
//
// Set this to the ratio your artwork is drawn at. 7/5 suits a 1400x1000
// canvas; use "aspect-[4/3]" for 1200x900. Getting it right matters: the
// photo is cropped to fill, so a wrong ratio shaves the edges of the
// artwork.
const BANNER = "aspect-[7/5]";

const FOCUS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-2";

// Dark enough on #4CAF50 to clear 4.5:1. White on that green is 2.8:1.
const ON_GREEN = "#10290F";

// Long highlights make ragged chips, so only short ones become chips.
// Every product in the catalogue has at least one that fits.
const CHIP_MAX = 28;

const normalise = (value) => String(value ?? "").toLowerCase();

const chipsFor = (product) =>
  (product.highlights ?? []).filter((h) => h.length <= CHIP_MAX).slice(0, 3);

// ==============================================
// PHOTO
// ==============================================
//
// `fit` is "cover" on a card, so the banner fills the frame, and "contain"
// in the detail dialog, so the whole artwork is visible and nothing is cut.
//
// If the file is not where we looked, the other folder is tried once (see
// ALT_BASE in products.images.js). Only then does the frame give up — and
// it keeps its shape and says what is missing, rather than showing the
// browser's broken-image icon, which reads as a bug.

function Photo({ src, alt, fit = "cover", className = "", sizes }) {
  const [current, setCurrent] = useState(src);
  const [failed, setFailed] = useState(false);

  // A different product in the same slot must get a fresh attempt.
  useEffect(() => {
    setCurrent(src);
    setFailed(false);
  }, [src]);

  if (failed || !current) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-50 px-4 text-center">
        <LuImage size={26} className="text-gray-400" aria-hidden />
        <span className="text-xs text-gray-500">Photo coming soon</span>
      </div>
    );
  }

  return (
    <img
      src={current}
      alt={alt}
      loading="lazy"
      decoding="async"
      sizes={sizes}
      onError={() => {
        const next = altSrc(current);
        if (next) setCurrent(next);
        else setFailed(true);
      }}
      className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"} ${className}`}
    />
  );
}

// ==============================================
// CATEGORY INDEX
// ==============================================
//
// The range itself is the opening image: one banner per category, each one
// a way in. On a phone the row scrolls sideways rather than shrinking to
// thumbnails.

function CategoryIndex({ leads, onPick, total }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="mb-6 text-sm font-semibold text-gray-900">
        {total} products in stock and to order.{" "}
        <span className="font-medium text-gray-500">
          Enquire on WhatsApp for pricing.
        </span>
      </p>
      <ul
        data-reveal
        className="sb-reveal -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-5"
      >
        {leads.map(({ category, product }) => (
          <li
            key={category.id}
            className="w-[68vw] shrink-0 snap-start sm:w-auto"
          >
            <button
              type="button"
              onClick={() => onPick(category.id)}
              className={`group block w-full rounded-lg text-left ${FOCUS}`}
            >
              <div
                className={`${BANNER} overflow-hidden rounded-lg bg-gray-50 ring-1 ring-black/5`}
              >
                <Photo
                  src={product.images?.[0]}
                  alt={`${category.label} — ${product.name}`}
                  sizes="(max-width: 640px) 68vw, 20vw"
                  className="transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              </div>
              <p className="mt-3 text-[15px] font-bold leading-snug text-gray-900 group-hover:text-[#4CAF50]">
                {category.label}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-gray-600">
                {category.blurb}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ==============================================
// FILTER BAR
// ==============================================

function FilterBar({ active, onPick, query, onQuery, counts, shown }) {
  // The site header is sticky, and its height changes with the contact bar
  // and the breakpoint. Measuring it beats hard-coding an offset that would
  // drift the moment the header changes.
  const [top, setTop] = useState(0);

  useEffect(() => {
    const read = () =>
      setTop(document.querySelector("header")?.offsetHeight ?? 0);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  const chips = [{ id: "all", label: "Everything" }, ...PRODUCT_CATEGORIES];

  return (
    <div
      className="sticky z-40 border-y border-gray-100 bg-white/95 backdrop-blur"
      style={{ top }}
    >
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            {chips.map((chip) => {
              const on = active === chip.id;
              const count =
                chip.id === "all" ? PRODUCTS.length : (counts[chip.id] ?? 0);
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => onPick(chip.id)}
                  aria-pressed={on}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors motion-reduce:transition-none ${FOCUS} ${
                    on
                      ? "border-[#222] bg-[#222] text-white"
                      : "border-gray-200 text-gray-700 hover:border-[#4CAF50] hover:text-[#4CAF50]"
                  }`}
                >
                  {chip.label}
                  <span
                    className={`ml-1.5 font-medium tabular-nums ${on ? "text-white/60" : "text-gray-400"}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <label className="relative block w-full lg:w-72">
              <span className="sr-only">{PRODUCTS_PAGE.searchPlaceholder}</span>
              <LuSearch
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder={PRODUCTS_PAGE.searchPlaceholder}
                className={`w-full rounded-full border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 ${FOCUS}`}
              />
            </label>
            <span
              className="hidden shrink-0 text-xs tabular-nums text-gray-500 sm:block"
              aria-live="polite"
            >
              {shown} shown
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==============================================
// ENQUIRY BUTTONS
// ==============================================

function WhatsappIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.38a9.86 9.86 0 004.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0012.04 2zm5.8 14.06c-.25.69-1.44 1.32-1.98 1.37-.53.05-1.02.24-3.45-.72-2.9-1.14-4.73-4.1-4.87-4.29-.14-.19-1.16-1.54-1.16-2.94s.73-2.09.99-2.37c.26-.29.57-.36.76-.36l.54.01c.17.01.41-.07.64.49.25.59.84 2.05.91 2.2.08.15.13.32.02.51-.1.19-.16.31-.31.48-.15.17-.32.38-.46.51-.15.15-.31.31-.13.6.17.29.77 1.27 1.65 2.06 1.14 1.01 2.09 1.33 2.39 1.48.29.14.46.12.63-.07.17-.2.73-.85.92-1.15.2-.29.39-.24.66-.14.26.1 1.68.79 1.96.94.29.14.48.21.55.33.07.12.07.69-.18 1.38z" />
    </svg>
  );
}

const OUTLINE_BTN =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-900 transition hover:border-[#4CAF50] hover:text-[#4CAF50]";

const GREEN_BTN =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#4CAF50] px-5 text-sm font-bold transition hover:brightness-95";

// ==============================================
// PRODUCT CARD
// ==============================================
//
// The banner fills the top of the card; everything a visitor needs to
// shortlist sits under it — the model, what it is, and the two or three
// facts that separate it from its neighbour on the shelf.
//
// The card is a <div>, not a button: it holds three controls of its own,
// and a button inside a button is invalid and unreachable by keyboard.

function ProductCard({ product, onOpen }) {
  const photos = product.images ?? [];
  const chips = chipsFor(product);

  return (
    <li className={`flex flex-col overflow-hidden ${CARD}`}>
      <button
        type="button"
        onClick={() => onOpen(product)}
        className={`group relative block ${BANNER} w-full overflow-hidden bg-gray-50 ${FOCUS}`}
        aria-label={`${product.model} — ${product.name}. Open details.`}
      >
        <Photo
          src={photos[0]}
          alt={product.name}
          sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 31vw"
          className="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        {photos.length > 1 ? (
          <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            <LuImages size={13} aria-hidden />
            {photos.length}
          </span>
        ) : null}
      </button>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-md border border-gray-200 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-gray-700">
            {product.model}
          </span>
          <span className="truncate text-[13px] text-gray-400">
            {product.brand}
          </span>
        </div>

        <h3 className="mt-3 text-[17px] font-extrabold leading-snug tracking-tight text-gray-900">
          {product.name}
        </h3>
        {product.tagline ? (
          <p className="mt-1.5 text-sm leading-6 text-gray-600">
            {product.tagline}
          </p>
        ) : null}

        {chips.length ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li
                key={chip}
                className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-600"
              >
                {chip}
              </li>
            ))}
          </ul>
        ) : null}

        {/* mt-auto keeps the buttons on the bottom edge however tall the text runs */}
        <div className="mt-auto flex gap-3 pt-5">
          <button
            type="button"
            onClick={() => onOpen(product)}
            className={`flex-1 ${OUTLINE_BTN} ${FOCUS}`}
          >
            Read more
          </button>
          <a
            href={whatsappLink(product)}
            target="_blank"
            rel="noreferrer"
            className={`flex-1 ${GREEN_BTN} ${FOCUS}`}
            style={{ color: ON_GREEN }}
            aria-label={`Enquire about ${product.model} on WhatsApp`}
          >
            <WhatsappIcon className="h-4 w-4" />
            Enquire
          </a>
        </div>
      </div>
    </li>
  );
}

// ==============================================
// MODAL
// ==============================================

function ProductModal({ product, onClose }) {
  const [index, setIndex] = useState(0);
  const closeRef = useRef(null);
  const photos = product.images ?? [];

  useEffect(() => {
    setIndex(0);
  }, [product]);

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((i) => (i + 1) % photos.length);
      if (event.key === "ArrowLeft")
        setIndex((i) => (i - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, photos.length]);

  const step = (delta) =>
    setIndex((i) => (i + delta + photos.length) % photos.length);

  const ARROW =
    "absolute top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-gray-900 shadow-md ring-1 ring-black/5 hover:text-[#4CAF50]";

  return (
    // Above the site header, which is sticky at z-50.
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${product.model} — ${product.name}`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-gray-900/55"
      />

      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-xl bg-white sm:max-h-[88vh] sm:rounded-xl">
        {/* ---------------- header ---------------- */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-[#4CAF50]">
              {categoryLabel(product.category)}
            </p>
            <h2 className="mt-1 truncate text-xl font-extrabold tracking-tight text-gray-900 sm:text-2xl">
              {product.model}
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">{product.name}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 ${FOCUS}`}
            aria-label="Close product details"
          >
            <LuX size={18} aria-hidden />
          </button>
        </div>

        {/* ---------------- body ---------------- */}
        <div className="grid flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          {/* gallery — stays in view on a wide screen while the specs scroll */}
          <div className="border-b border-gray-100 bg-white p-5 sm:p-7 lg:sticky lg:top-0 lg:self-start lg:border-b-0 lg:border-r">
            <div
              className={`relative ${BANNER} overflow-hidden rounded-lg bg-gray-50 ring-1 ring-black/5`}
            >
              {/* "contain" here: the whole banner matters in the detail view */}
              <Photo
                src={photos[index]}
                alt={`${product.name}, photo ${index + 1} of ${photos.length}`}
                fit="contain"
                sizes="(max-width: 1024px) 92vw, 48vw"
              />
              {photos.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Previous photo"
                    className={`${ARROW} left-2 ${FOCUS}`}
                  >
                    <LuChevronLeft aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Next photo"
                    className={`${ARROW} right-2 ${FOCUS}`}
                  >
                    <LuChevronRight aria-hidden />
                  </button>
                </>
              ) : null}
            </div>

            {photos.length > 1 ? (
              <ul className="mt-3 flex gap-2">
                {photos.map((photo, i) => (
                  <li key={photo}>
                    <button
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Photo ${i + 1}`}
                      aria-current={i === index}
                      className={`h-16 w-20 overflow-hidden rounded-md border-2 bg-gray-50 ${FOCUS} ${
                        i === index ? "border-[#4CAF50]" : "border-gray-200"
                      }`}
                    >
                      <Photo src={photo} alt="" sizes="80px" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {product.summary ? (
              <p className="mt-5 max-w-[60ch] text-sm leading-7 text-gray-600">
                {product.summary}
              </p>
            ) : null}
          </div>

          {/* details */}
          <div className="p-5 sm:p-7">
            {product.tagline ? (
              <p className="text-base font-bold leading-snug text-gray-900">
                {product.tagline}
              </p>
            ) : null}

            {product.features?.length ? (
              <ul className="mt-4 space-y-2.5">
                {product.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-2.5 text-sm leading-6 text-gray-700"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      className="mt-1.5 h-3 w-3 shrink-0"
                    >
                      <path
                        d="M2 8.5l4 4 8-9"
                        fill="none"
                        stroke="#4CAF50"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {product.specs?.length ? (
              <div className="mt-7">
                <h3 className="text-sm font-extrabold tracking-tight text-gray-900">
                  Specifications
                </h3>
                <dl className="mt-3">
                  {product.specs.map(([label, value]) => (
                    <div
                      key={label}
                      className="grid grid-cols-[minmax(7.5rem,0.8fr)_minmax(0,1.4fr)] gap-4 border-t border-gray-100 py-2.5 text-[13px] leading-6"
                    >
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="font-medium text-gray-800">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
        </div>

        {/* ---------------- enquiry bar ---------------- */}
        <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-3.5 sm:px-7">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="hidden text-[13px] text-gray-500 sm:block">
              We reply with availability and the right option for your outlet.
            </p>
            <div className="flex gap-2.5">
              <a href={callLink} className={`${OUTLINE_BTN} ${FOCUS}`}>
                <LuPhone aria-hidden />
                Call
              </a>
              <a
                href={whatsappLink(product)}
                target="_blank"
                rel="noreferrer"
                className={`flex-1 sm:flex-none ${GREEN_BTN} ${FOCUS}`}
                style={{ color: ON_GREEN }}
              >
                <WhatsappIcon className="h-4 w-4" />
                Enquire on WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==============================================
// PAGE
// ==============================================

export default function ProductsPage() {
  const [active, setActive] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);

  const counts = useMemo(() => {
    const out = {};
    for (const product of PRODUCTS) {
      out[product.category] = (out[product.category] ?? 0) + 1;
    }
    return out;
  }, []);

  // One banner per category for the opening row.
  const leads = useMemo(
    () =>
      PRODUCT_CATEGORIES.map((category) => ({
        category,
        product:
          PRODUCTS.find(
            (p) => p.category === category.id && p.images?.length,
          ) ?? PRODUCTS.find((p) => p.category === category.id),
      })).filter((lead) => lead.product),
    [],
  );

  const matches = useMemo(() => {
    const needle = normalise(query).trim();
    return PRODUCTS.filter((product) => {
      if (active !== "all" && product.category !== active) return false;
      if (!needle) return true;
      return [
        product.model,
        product.name,
        product.brand,
        product.tagline,
        categoryLabel(product.category),
        ...(product.highlights ?? []),
      ]
        .map(normalise)
        .join(" ")
        .includes(needle);
    });
  }, [active, query]);

  // Grouped so the catalogue reads as sections, not one long wall.
  const groups = useMemo(
    () =>
      PRODUCT_CATEGORIES.map((category) => ({
        category,
        items: matches.filter((product) => product.category === category.id),
      })).filter((group) => group.items.length > 0),
    [matches],
  );

  const pickCategory = (id) => {
    setActive(id);
    document
      .getElementById("catalogue")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <SiteLayout>
      {/* PageIntro puts its children inside its own <p>, so this stays inline. */}
      <PageIntro
        eyebrow="Hardware"
        crumb="Products"
        title={PRODUCTS_PAGE.title}
      >
        {PRODUCTS_PAGE.intro}
      </PageIntro>

      <CategoryIndex
        leads={leads}
        onPick={pickCategory}
        total={PRODUCTS.length}
      />

      {/*
       * The filter bar sticks against the site header. It must be a direct
       * child here: a sticky element only travels inside its own parent, so
       * wrapping it in a spacer div would pin it in place immediately.
       */}
      <FilterBar
        active={active}
        onPick={setActive}
        query={query}
        onQuery={setQuery}
        counts={counts}
        shown={matches.length}
      />

      <div
        id="catalogue"
        className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16"
      >
        {groups.length === 0 ? (
          <div className="py-20 text-center">
            <p className="mx-auto max-w-[46ch] leading-7 text-gray-600">
              {PRODUCTS_PAGE.empty}
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActive("all");
              }}
              className={`mt-5 ${OUTLINE_BTN} px-5 ${FOCUS}`}
            >
              Clear the search
            </button>
          </div>
        ) : (
          groups.map(({ category, items }) => (
            <section key={category.id} className="mb-16 last:mb-0">
              <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-gray-200 pb-3">
                <h2 className="text-xl font-extrabold tracking-tight text-gray-900 sm:text-2xl">
                  {category.label}
                </h2>
                <p className="text-[13px] text-gray-500">{category.blurb}</p>
              </div>

              {/* One, two, then three across — never more. */}
              <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onOpen={setOpen}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* ---------------- help ---------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div
          data-reveal
          className={`sb-reveal grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${CARD}`}
        >
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-gray-900 sm:text-2xl">
              {PRODUCTS_PAGE.helpTitle}
            </h2>
            <p className="mt-2.5 max-w-[60ch] leading-7 text-gray-600">
              {PRODUCTS_PAGE.helpBody}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={callLink} className={`${OUTLINE_BTN} ${FOCUS}`}>
              <LuPhone aria-hidden />
              Call {PRODUCT_CONTACT.phoneDisplay}
            </a>
            <a
              href={whatsappLink(null)}
              target="_blank"
              rel="noreferrer"
              className={`${GREEN_BTN} ${FOCUS}`}
              style={{ color: ON_GREEN }}
            >
              <WhatsappIcon className="h-4 w-4" />
              Ask us on WhatsApp
            </a>
          </div>
        </div>
      </section>

      {open ? (
        <ProductModal product={open} onClose={() => setOpen(null)} />
      ) : null}

      <CtaBand />
    </SiteLayout>
  );
}
