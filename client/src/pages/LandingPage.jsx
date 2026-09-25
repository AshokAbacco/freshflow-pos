import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LuArrowRight,
  LuGraduationCap,
  LuHeadphones,
  LuLeaf,
  LuPlay,
  LuPrinter,
  LuScale,
  LuStore,
  LuUndo2,
  LuWifiOff,
} from "react-icons/lu";
import { SiteLayout } from "../components/site/SiteFooter";
import { BRAND } from "../lib/brand";

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

const IMAGES = {
  heroMain:
    "https://thumbs.dreamstime.com/b/woman-holding-shopping-paper-bag-organic-bio-vegetables-fruits-smiling-young-latin-healthy-eating-concept-38249871.jpg",
  heroAlt:
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=800",
  familyStore:
    "https://t3.ftcdn.net/jpg/03/13/86/90/240_F_313869029_5NG3t4lmXBBYbtgt9Mjq77qjx8N4O8hJ.jpg",
  fastCheckout:
    "https://as2.ftcdn.net/v2/jpg/01/85/24/75/1000_F_185247569_1bL3VcUMDbXfMTAnNGHNce9adLZp60Ky.jpg",
  burger:
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400",
  tomatoes:
    "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&q=80&w=400",
  farmers:
    "https://acestranetworks.com/wp-content/uploads/2024/02/rural-ecommerce.jpg?auto=format&fit=crop&q=80&w=600",
  products: [
    {
      img: "https://cdn.britannica.com/22/187222-050-07B17FB6/apples-on-a-tree-branch.jpg?auto=format&fit=crop&q=80&w=300",
      name: "Fresh Fuji Apples",
      desc: "Locally Sourced",
      price: "₹120/kg",
      code: "101",
    },
    {
      img: "https://images.pexels.com/photos/1998893/pexels-photo-1998893.jpeg?auto=format&fit=crop&q=80&w=300",
      name: "Organic Strawberries",
      desc: "Farm Fresh Daily",
      price: "₹250/box",
      code: "102",
    },
    {
      img: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&q=80&w=300",
      name: "Nagpur Oranges",
      desc: "Vitamin C Rich",
      price: "₹90/kg",
      code: "103",
    },
    {
      img: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&q=80&w=300",
      name: "Robusta Bananas",
      desc: "Premium Quality",
      price: "₹60/dozen",
      code: "104",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

// Facts about the product rather than customer counts, so nothing here needs verifying.
const STATS = [
  { value: "30 days", label: "Free trial", tint: "bg-[#FDECEF]" },
  { value: "₹0", label: "To get started", tint: "bg-[#E8F5E9]" },
  { value: "3", label: "Payment modes", tint: "bg-[#E8F0FE]" },
  { value: "100%", label: "Offline-ready", tint: "bg-[#E8F5E9]" },
];

const CATEGORIES = [
  {
    title: "Organic Vegetables",
    img: IMAGES.tomatoes,
    tint: "bg-[#EAF6EA]",
    rows: [
      ["Tomatoes", "kg"],
      ["Onions", "kg"],
      ["Potatoes", "kg"],
      ["Green chilli", "g"],
      ["Coriander", "bunch"],
    ],
  },
  {
    title: "Fresh Fruits",
    img: IMAGES.products[1].img,
    tint: "bg-[#FDECEF]",
    rows: [
      ["Apples", "kg"],
      ["Strawberries", "box"],
      ["Oranges", "kg"],
      ["Bananas", "dozen"],
      ["Grapes", "kg"],
    ],
  },
  {
    title: "Daily Staples",
    img: IMAGES.familyStore,
    tint: "bg-[#FFF3E6]",
    rows: [
      ["Rice", "kg"],
      ["Atta", "kg"],
      ["Toor dal", "kg"],
      ["Sugar", "kg"],
      ["Cooking oil", "L"],
    ],
  },
  {
    title: "Snacks & Fast Food",
    img: IMAGES.burger,
    tint: "bg-[#FDECEF]",
    rows: [
      ["Burgers", "pc"],
      ["Sandwiches", "pc"],
      ["Chips", "pack"],
      ["Cold drinks", "bottle"],
      ["Ice cream", "cup"],
    ],
  },
];

const PRODUCT_TABS = {
  "New Arrivals": [0, 1, 2, 3],
  Trending: [1, 3, 0, 2],
  "Best Selling": [3, 2, 1, 0],
};

const SUPPORT = [
  {
    icon: LuStore,
    title: "Store Setup",
    body: "Products, staff and tills ready before you open",
  },
  {
    icon: LuPrinter,
    title: "Hardware Help",
    body: "Scanners, weighing scales and printers",
  },
  {
    icon: LuGraduationCap,
    title: "Staff Training",
    body: "A short walkthrough for cashiers and owners",
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const GREEN = "#4CAF50";
const ORANGE = "#FF7B29";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function useScrollReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const targets = root.querySelectorAll("[data-reveal]");
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef]);
}

// Counts down to the first day of next month. Change OFFER_ENDS if your launch offer ends on a fixed date.
function useCountdown() {
  const target = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  }, []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target - now);
  return [
    [Math.floor(diff / 864e5), "Days"],
    [Math.floor(diff / 36e5) % 24, "Hours"],
    [Math.floor(diff / 6e4) % 60, "Minutes"],
    [Math.floor(diff / 1e3) % 60, "Seconds"],
  ];
}

/** An image that falls back to a soft tint if the remote host refuses to serve it. */
function Photo({ src, alt, className = "", eager = false }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`${className} bg-gradient-to-br from-[#E8F5E9] to-[#FFF1E6]`}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function Eyebrow({ children, center = false, light = false }) {
  return (
    <p
      className={`flex items-center gap-2 font-serif text-sm font-semibold italic ${
        light ? "text-[#FFB27D]" : "text-[#FF7B29]"
      } ${center ? "justify-center" : ""}`}
    >
      {children}
      <span className="h-px w-10 bg-current" aria-hidden />
      <LuArrowRight className="-ml-2.5" size={14} aria-hidden />
    </p>
  );
}

function SectionTitle({ eyebrow, title, sub }) {
  return (
    <div data-reveal className="sb-reveal mx-auto max-w-2xl text-center">
      <Eyebrow center>{eyebrow}</Eyebrow>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
        {title}
      </h2>
      {sub ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">{sub}</p>
      ) : null}
    </div>
  );
}

const STYLES = `
  .sb-reveal { opacity: 0; transform: translateY(28px); transition: opacity .8s ease, transform .8s cubic-bezier(.2,.8,.2,1); transition-delay: var(--d, 0ms); }
  .sb-reveal.is-visible { opacity: 1; transform: none; }

  @keyframes sb-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
  .sb-float { animation: sb-float 6s ease-in-out infinite; }

  @keyframes sb-spin { to { transform: rotate(360deg); } }
  .sb-spin { animation: sb-spin 18s linear infinite; }

  /* Paper texture for the cream sections */
  .sb-paper {
    background-color: #F7F2EC;
    background-image: radial-gradient(rgba(0,0,0,.035) 1px, transparent 1px);
    background-size: 6px 6px;
  }

  /* Jagged "paint splash" behind the hero photo */
  .sb-splash {
    clip-path: polygon(8% 18%, 18% 4%, 30% 12%, 44% 0%, 56% 10%, 70% 2%, 80% 14%, 94% 8%, 92% 24%, 100% 36%,
      90% 48%, 100% 62%, 88% 72%, 96% 88%, 80% 90%, 70% 100%, 58% 90%, 44% 100%, 32% 90%, 18% 98%, 14% 84%,
      0% 76%, 8% 62%, 0% 48%, 10% 38%, 0% 26%);
  }

  @media (prefers-reduced-motion: reduce) {
    .sb-reveal { opacity: 1; transform: none; transition: none; }
    .sb-float, .sb-spin { animation: none; }
  }
`;

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="sb-paper relative overflow-hidden">
      {/* Green panel on the right, as in the reference */}
      <div
        className="absolute inset-y-0 right-0 hidden w-[40%] bg-[#4CAF50] lg:block"
        aria-hidden
      >
        <LuLeaf
          className="absolute bottom-10 right-10 text-white/15"
          size={180}
        />
      </div>
      <LuLeaf
        className="absolute left-4 top-6 text-[#FF7B29]/15"
        size={120}
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-32 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-2 lg:pb-40">
        <div data-reveal className="sb-reveal">
          <Eyebrow>100% offline-ready billing</Eyebrow>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            Fresh &amp; Fast
            <br />
            Supermarket Billing
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-gray-600">
            {BRAND.name} runs your counter, your stock and your daily numbers.
            Scan, weigh, take UPI, and keep billing even when the internet
            drops.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center gap-3 rounded-md bg-[#FF7B29] px-5 py-2.5 text-white shadow-lg shadow-orange-500/20 transition hover:bg-[#f06a17]"
            >
              <LuPlay size={20} aria-hidden />
              <span className="flex flex-col leading-tight">
                <span className="text-[11px] opacity-85">Start with a</span>
                <span className="text-sm font-bold">Free Trial</span>
              </span>
            </Link>
            <Link
              to="/features"
              className="inline-flex items-center gap-3 rounded-md bg-gray-900 px-5 py-2.5 text-white transition hover:bg-black"
            >
              <LuScale size={20} aria-hidden />
              <span className="flex flex-col leading-tight">
                <span className="text-[11px] opacity-75">Explore all</span>
                <span className="text-sm font-bold">Features</span>
              </span>
            </Link>
          </div>
        </div>

        <div
          data-reveal
          className="sb-reveal relative mx-auto -mb-32 w-full max-w-md self-end lg:-mb-40"
          style={{ "--d": "150ms" }}
        >
          {/* Phone/tablet: its own green backdrop, since the full green panel only shows on large screens */}
          <div
            className="absolute inset-x-6 inset-y-6 rounded-[2rem] bg-[#4CAF50] lg:hidden"
            aria-hidden
          />
          <div className="relative aspect-square">
            <div
              className="sb-splash absolute bottom-[14%] left-[22%] right-0 top-[2%] bg-[#FF7B29]"
              aria-hidden
            />
            <div
              className="sb-splash absolute bottom-0 left-0 right-[24%] top-[20%] bg-[#2E7D32]/80"
              aria-hidden
            />
            {/*
              Transparent PNG from /public. It stands on the bottom edge of the hero, and the bottom
              fades out, so the cropped edge of the photo is never visible. The promo cards below
              overlap this edge as well.
            */}
            <img
              src="/hero-img-1.png"
              alt="Shopper holding a bag of fresh groceries"
              loading="eager"
              decoding="async"
              className="absolute bottom-0 left-1/2 h-[118%] w-auto max-w-none -translate-x-1/2 object-contain object-bottom"
              style={{
                maskImage:
                  "linear-gradient(to bottom, #000 80%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, #000 80%, transparent 100%)",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PromoCards() {
  return (
    <div className="relative z-10 mx-auto -mt-20 grid max-w-7xl gap-5 px-4 sm:px-6 md:grid-cols-2 lg:-mt-28">
      <div
        data-reveal
        className="sb-reveal flex items-center gap-4 overflow-hidden rounded-xl bg-[#111] p-6 text-white shadow-xl"
      >
        <div className="min-w-0 flex-1">
          <Eyebrow light>Super speed</Eyebrow>
          <h3 className="mt-2 text-xl font-extrabold sm:text-2xl">
            Quick Codes for Best Sellers
          </h3>
          <p className="mt-2 inline-flex rounded bg-[#FF7B29]/15 px-2 py-1 text-xs font-semibold text-[#FFB27D]">
            Type a code, it’s on the bill
          </p>
          <Link
            to="/features"
            className="mt-4 flex w-fit items-center gap-1.5 rounded bg-[#FF7B29] px-4 py-2 text-xs font-bold hover:bg-[#f06a17]"
          >
            Learn more <LuArrowRight aria-hidden />
          </Link>
        </div>
        <Photo
          src={IMAGES.burger}
          alt="Burger"
          className="h-28 w-28 shrink-0 rounded-full object-cover sm:h-36 sm:w-36"
        />
      </div>

      <div
        data-reveal
        className="sb-reveal flex items-center gap-4 overflow-hidden rounded-xl bg-white p-6 shadow-xl ring-1 ring-black/5"
        style={{ "--d": "120ms" }}
      >
        <div className="min-w-0 flex-1">
          <Eyebrow>Launch offer</Eyebrow>
          <h3 className="mt-2 text-xl font-extrabold text-gray-900 sm:text-2xl">
            Every Plan Discounted at Launch
          </h3>
          <Link
            to="/pricing"
            className="mt-4 flex w-fit items-center gap-1.5 rounded bg-[#4CAF50] px-4 py-2 text-xs font-bold text-white hover:bg-[#43a047]"
          >
            See pricing <LuArrowRight aria-hidden />
          </Link>
        </div>
        <Photo
          src={IMAGES.tomatoes}
          alt="Fresh tomatoes"
          className="h-28 w-28 shrink-0 rounded-full object-cover sm:h-36 sm:w-36"
        />
      </div>
    </div>
  );
}

function CircleBadge() {
  return (
    <div className="absolute -right-2 top-4 grid h-28 w-28 place-items-center rounded-full bg-[#FF7B29] text-white shadow-lg sm:right-2">
      <svg
        viewBox="0 0 100 100"
        className="sb-spin absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <path
            id="sb-circle"
            d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0"
          />
        </defs>
        <text fill="white" fontSize="9" fontWeight="700" letterSpacing="1.5">
          <textPath href="#sb-circle">
            MADE FOR KIRANA • MADE FOR SUPERMARKETS •
          </textPath>
        </text>
      </svg>
      <div className="text-center leading-tight">
        <p className="text-2xl font-extrabold">30</p>
        <p className="text-[10px] font-semibold">days free</p>
      </div>
    </div>
  );
}

function About() {
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
      <div data-reveal className="sb-reveal relative mx-auto w-full max-w-md">
        <div className="aspect-square overflow-hidden rounded-full bg-[#E8F5E9]">
          <Photo
            src={IMAGES.farmers}
            alt="Store owners using a tablet"
            className="h-full w-full object-cover"
          />
        </div>
        <CircleBadge />
        <blockquote className="absolute -bottom-6 right-0 max-w-[260px] rounded-lg bg-[#4CAF50] p-5 text-white shadow-xl sm:-right-4">
          <p className="font-serif text-base italic leading-snug">
            “Every sale, return and delivery moves stock, and leaves a record.”
          </p>
          <footer className="mt-2 text-right text-xs font-semibold">
            — Team {BRAND.company}
          </footer>
        </blockquote>
      </div>

      <div data-reveal className="sb-reveal" style={{ "--d": "120ms" }}>
        <Eyebrow>Built for Indian grocery stores</Eyebrow>
        <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-4xl">
          Bill Faster &amp; Keep Your Stock Honest.
        </h2>
        <p className="mt-4 text-sm leading-7 text-gray-600">
          Scan barcodes, weigh loose produce over USB, and show a UPI QR for the
          exact amount. Cashiers see only the register. Owners see reports,
          stock and pricing, across every till in the shop.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: LuWifiOff,
              title: "Works Offline",
              body: "Bills are saved on the till and upload when the connection returns.",
            },
            {
              icon: LuUndo2,
              title: "Easy Returns",
              body: "Returns put items back into stock and are recorded with a reason.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-lg bg-white p-5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#E8F5E9] text-[#4CAF50]">
                <Icon size={20} aria-hidden />
              </span>
              <h3 className="mt-3 font-bold text-gray-900">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-gray-500">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Categories() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6">
      <SectionTitle
        eyebrow="Every aisle, one till"
        title="Browse All Categories"
        sub="Bill by the kilo, the piece, the dozen or the box. Each item uses the unit it sells in."
      />
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {CATEGORIES.map((c, i) => (
          <div
            key={c.title}
            data-reveal
            className="sb-reveal group rounded-lg border-b-4 border-transparent bg-white p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 transition hover:border-[#4CAF50]"
            style={{ "--d": `${i * 90}ms` }}
          >
            <div className={`h-32 overflow-hidden rounded-md ${c.tint}`}>
              <Photo
                src={c.img}
                alt={c.title}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
            </div>
            <h3 className="mt-4 font-bold text-gray-900">{c.title}</h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-500">
              {c.rows.map(([name, unit]) => (
                <li key={name} className="flex justify-between">
                  <span>{name}</span>
                  <span className="font-medium text-gray-700">{unit}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/features"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-gray-900 group-hover:text-[#4CAF50]"
            >
              Explore more <LuArrowRight aria-hidden />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function BestFeature() {
  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
      <div
        data-reveal
        className="sb-reveal relative overflow-hidden rounded-xl bg-[#111] text-white"
      >
        <Photo
          src={IMAGES.fastCheckout}
          alt="Checkout counter"
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent"
          aria-hidden
        />
        <div className="relative max-w-xs p-8">
          <Eyebrow light>Best loved feature</Eyebrow>
          <h3 className="mt-2 text-2xl font-extrabold leading-tight">
            Fast Checkout For Your Family Store
          </h3>
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-white/85">
            <span className="h-2 w-2 rounded-full bg-[#FF7B29]" aria-hidden />{" "}
            Scan, weigh, take UPI, print
          </p>
          <Link
            to="/signup"
            className="mt-5 inline-flex items-center gap-1.5 rounded bg-[#FF7B29] px-4 py-2 text-xs font-bold hover:bg-[#f06a17]"
          >
            Try it free <LuArrowRight aria-hidden />
          </Link>
        </div>
      </div>

      <div
        data-reveal
        className="sb-reveal grid grid-cols-2 gap-3 rounded-xl bg-white p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5"
        style={{ "--d": "120ms" }}
      >
        {STATS.map((s) => (
          <div
            key={s.label}
            className={`flex flex-col justify-center rounded-lg p-4 ${s.tint}`}
          >
            <p className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
              {s.value}
            </p>
            <p className="mt-1 text-xs font-medium text-gray-600">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Products() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <SectionTitle
        eyebrow="Featured products"
        title="Fresh Products, Billed in a Tap"
      />
      <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
        {IMAGES.products.map((p, i) => (
          <div
            key={p.name}
            data-reveal
            className="sb-reveal group relative rounded-lg bg-white p-4 text-center shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 transition hover:-translate-y-1"
            style={{ "--d": `${i * 90}ms` }}
          >
            <span className="absolute left-3 top-3 z-10 rounded bg-[#FF7B29] px-1.5 py-0.5 text-[10px] font-bold text-white">
              Code {p.code}
            </span>
            <div className="mx-auto aspect-square w-full max-w-[160px] overflow-hidden rounded-md">
              <Photo
                src={p.img}
                alt={p.name}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
              />
            </div>
            <h3 className="mt-3 text-sm font-bold text-gray-900">{p.name}</h3>
            <p className="text-xs text-gray-500">{p.desc}</p>
            <p className="mt-1 font-extrabold text-[#FF7B29]">{p.price}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center">
        <Link
          to="/features"
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-[#4CAF50]"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#4CAF50] text-white">
            <LuArrowRight size={14} aria-hidden />
          </span>
          See how billing works
        </Link>
      </p>
    </section>
  );
}

function Discount() {
  const parts = useCountdown();
  const collage = [
    {
      img: IMAGES.products[1].img,
      cls: "left-0 top-16 -rotate-6 w-40 sm:w-48",
    },
    { img: IMAGES.products[2].img, cls: "right-4 top-0 rotate-6 w-36 sm:w-44" },
    {
      img: IMAGES.products[0].img,
      cls: "right-0 bottom-0 -rotate-3 w-36 sm:w-44",
    },
  ];
  return (
    <section className="sb-paper overflow-hidden py-16">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div data-reveal className="sb-reveal">
          <Eyebrow>Launch offer</Eyebrow>
          <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-4xl">
            Special <span className="text-[#FF7B29]">Discount For All</span>
            <br />
            Grocery Stores
          </h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-gray-600">
            Start with a free month, then pick a plan at the launch price. Pay
            per staff account, only for the ones you keep active.
          </p>
          <div
            className="mt-6 flex gap-3"
            role="timer"
            aria-label="Time left on the launch offer"
          >
            {parts.map(([n, label]) => (
              <div
                key={label}
                className="w-16 rounded-md bg-white py-2 text-center shadow-sm ring-1 ring-black/5 sm:w-20"
              >
                <p className="text-xl font-extrabold tabular-nums text-gray-900 sm:text-2xl">
                  {String(n).padStart(2, "0")}
                </p>
                <p className="text-[10px] font-medium text-gray-500">{label}</p>
              </div>
            ))}
          </div>
          <Link
            to="/pricing"
            className="mt-6 inline-flex items-center gap-1.5 rounded bg-[#4CAF50] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#43a047]"
          >
            See plans <LuArrowRight aria-hidden />
          </Link>
        </div>

        <div
          data-reveal
          className="sb-reveal relative mx-auto h-72 w-full max-w-md sm:h-80"
          style={{ "--d": "150ms" }}
        >
          {collage.map(({ img, cls }) => (
            <div key={img} className={`absolute bg-white p-2 shadow-xl ${cls}`}>
              <Photo
                src={img}
                alt=""
                className="aspect-square w-full object-cover"
              />
            </div>
          ))}
          <div className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#FF7B29] text-center text-[11px] font-extrabold leading-tight text-white shadow-lg">
            Launch
            <br />
            price
          </div>
        </div>
      </div>
    </section>
  );
}

function SpecialOffer() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [tab, setTab] = useState("New Arrivals");
  const items = PRODUCT_TABS[tab].map((i) => IMAGES.products[i]);

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2fr]">
      <div
        data-reveal
        className="sb-reveal relative overflow-hidden rounded-xl bg-[#111] p-7 text-white"
      >
        <Photo
          src={IMAGES.heroAlt}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/40"
          aria-hidden
        />
        <div className="relative">
          <h3 className="text-xl font-extrabold leading-snug">
            Start your free month &amp; bill today
          </h3>
          <p className="mt-2 text-sm text-white/75">
            No card needed. Set up your products and start billing in minutes.
          </p>
          <form
            className="mt-6 flex overflow-hidden rounded bg-white"
            onSubmit={(e) => {
              e.preventDefault();
              navigate("/signup");
            }}
          >
            <label htmlFor="cta-email" className="sr-only">
              Email address
            </label>
            <input
              id="cta-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
              className="min-w-0 flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none"
            />
            <button
              type="submit"
              className="bg-[#FF7B29] px-4 text-xs font-bold text-white hover:bg-[#f06a17]"
            >
              Start
            </button>
          </form>
        </div>
      </div>

      <div data-reveal className="sb-reveal" style={{ "--d": "120ms" }}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-gray-100 pb-3">
          <h3 className="mr-auto text-xl font-extrabold text-gray-900">
            Popular at the Counter
          </h3>
          <div role="tablist" aria-label="Product lists" className="flex gap-4">
            {Object.keys(PRODUCT_TABS).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`text-sm font-semibold transition ${
                  tab === t
                    ? "text-[#FF7B29] underline decoration-2 underline-offset-8"
                    : "text-gray-700 hover:text-gray-900"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2">
          {items.map((p) => (
            <li
              key={p.name}
              className="flex items-center gap-4 rounded-lg bg-white p-3 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5"
            >
              <Photo
                src={p.img}
                alt={p.name}
                className="h-20 w-20 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0">
                <p className="truncate font-bold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500">{p.desc}</p>
                <p className="mt-1 text-sm font-extrabold text-[#FF7B29]">
                  {p.price}
                </p>
                <p className="text-xs font-semibold text-gray-700">
                  Quick code {p.code}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SupportTeam() {
  return (
    <section className="bg-gradient-to-b from-white to-[#FFF4EC]">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2.2fr]">
        <div data-reveal className="sb-reveal">
          <Eyebrow>Help when you need it</Eyebrow>
          <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-gray-900">
            Our Customer Help Team
          </h2>
          <p className="mt-3 text-sm leading-7 text-gray-600">
            The {BRAND.company} team can set things up with you, from your
            product list to the scale on the counter.
          </p>
          <Link
            to="/services"
            className="mt-5 inline-flex items-center gap-1.5 rounded bg-[#FF7B29] px-4 py-2 text-xs font-bold text-white hover:bg-[#f06a17]"
          >
            <LuHeadphones aria-hidden /> Our services
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {SUPPORT.map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              data-reveal
              className="sb-reveal rounded-lg bg-white p-6 text-center shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5"
              style={{ "--d": `${i * 100}ms` }}
            >
              <span className="mx-auto grid h-20 w-20 place-items-center rounded-full border-4 border-[#E8F5E9] bg-[#4CAF50] text-white">
                <Icon size={30} aria-hidden />
              </span>
              <h3 className="mt-4 font-bold text-gray-900">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-gray-500">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const rootRef = useRef(null);
  useScrollReveal(rootRef);

  return (
    <SiteLayout>
      <style>{STYLES}</style>
      <div ref={rootRef} className="overflow-x-clip bg-[#FBFAF8]">
        <Hero />
        <PromoCards />
        <About />
        <Categories />
        <BestFeature />
        <Products />
        <Discount />
        <SpecialOffer />
        <SupportTeam />
      </div>
    </SiteLayout>
  );
}
