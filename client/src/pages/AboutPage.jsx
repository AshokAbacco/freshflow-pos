import { Link } from "react-router-dom";
import {
  LuCheck,
  LuChevronRight,
  LuHeart,
  LuLeaf,
  LuTarget,
  LuWifiOff,
} from "react-icons/lu";
import { CtaBand, SiteLayout } from "../components/site/SiteFooter";
import { CARD, Eyebrow, Photo, SectionTitle } from "../components/site/theme";
import { BRAND } from "../lib/brand";
import { SITE_IMAGES } from "../lib/siteImages";

const VALUES = [
  {
    icon: LuWifiOff,
    title: "The counter never stops",
    body: "A shop cannot turn customers away because the internet is down, so billing works offline first.",
  },
  {
    icon: LuTarget,
    title: "Simple for the cashier",
    body: "The person at the till sees the register and nothing else. Fewer buttons, fewer mistakes.",
  },
  {
    icon: LuHeart,
    title: "Fair, per-person pricing",
    body: "You pay for the staff accounts you keep active, and you can try everything free for a month.",
  },
];

// Facts about the product, not customer counts.
const FACTS = [
  { value: "30 days", label: "Free trial", tint: "bg-[#FDECEF]" },
  { value: "₹0", label: "To get started", tint: "bg-[#E8F5E9]" },
  { value: "3", label: "Payment modes", tint: "bg-[#E8F0FE]" },
  { value: "100%", label: "Offline-ready", tint: "bg-[#FFF3E6]" },
];

/**
 * Hero for this page only. Same look as the shared PageIntro banner, but with the transparent
 * PNG from /public standing on the bottom edge of the section instead of a round framed photo.
 * The section clips the image at its bottom edge and the last part fades out, so the cropped
 * edge of the photo is never visible.
 */
function AboutHero() {
  return (
    <section className="sb-paper relative overflow-hidden">
      <div
        className="absolute inset-y-0 right-0 hidden w-[34%] bg-[#4CAF50] lg:block"
        aria-hidden
      >
        <LuLeaf
          className="absolute bottom-6 right-6 text-white/15"
          size={140}
        />
      </div>
      <LuLeaf
        className="absolute left-4 top-4 text-[#FF7B29]/15"
        size={100}
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.4fr_1fr]">
        <div data-reveal className="sb-reveal">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500"
          >
            <Link to="/" className="hover:text-[#4CAF50]">
              Home
            </Link>
            <LuChevronRight aria-hidden />
            <span className="text-[#4CAF50]">About</span>
          </nav>
          <div className="mt-4">
            <Eyebrow>Who we are</Eyebrow>
          </div>
          <h1 className="mt-2 text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl">
            About {BRAND.name}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-gray-600">
            {BRAND.name} is a billing and stock system for supermarkets and
            kirana stores, made by {BRAND.company}.
          </p>
        </div>

        {/* The negative bottom margin matches the section padding, so the photo stands on the section edge. */}
        <div
          data-reveal
          className="sb-reveal relative mx-auto -mb-14 hidden w-full max-w-xs self-end sm:-mb-20 sm:block"
          style={{ "--d": "150ms" }}
        >
          <div className="relative aspect-square">
            <div
              className="sb-splash absolute bottom-[14%] left-[22%] right-0 top-[2%] bg-[#FF7B29]"
              aria-hidden
            />
            <div
              className="sb-splash absolute bottom-0 left-0 right-[24%] top-[20%] bg-[#2E7D32]/80"
              aria-hidden
            />
            <img
              src="/about-hero-img.png"
              alt={`The team behind ${BRAND.name}`}
              loading="eager"
              decoding="async"
              className="absolute bottom-0 left-1/2 h-[118%] w-auto max-w-none -translate-x-1/2 object-contain object-bottom"
              style={{
                maskImage:
                  "linear-gradient(to bottom, #000 82%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, #000 82%, transparent 100%)",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <SiteLayout>
      <AboutHero />

      {/* Story */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div
          data-reveal
          className="sb-reveal relative mx-auto w-full max-w-md pb-10 pr-10"
        >
          <div className="aspect-[4/5] overflow-hidden rounded-xl bg-[#E8F5E9] shadow-xl">
            <Photo
              src={SITE_IMAGES.familyStore}
              alt="A family grocery store"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute bottom-0 right-0 h-44 w-44 overflow-hidden rounded-full border-8 border-white shadow-xl">
            <Photo
              src={SITE_IMAGES.fastCheckout}
              alt="A checkout counter"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute -left-3 top-6 rounded-lg bg-[#FF7B29] px-4 py-3 text-white shadow-lg">
            <p className="text-xs font-semibold opacity-90">Made by</p>
            <p className="text-lg font-extrabold">{BRAND.company}</p>
          </div>
        </div>

        <div data-reveal className="sb-reveal" style={{ "--d": "120ms" }}>
          <Eyebrow>Our story</Eyebrow>
          <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-4xl">
            Built Around the Grocery Counter
          </h2>
          {/* Replace these paragraphs with Abacco's own story. */}
          <div className="mt-4 space-y-4 text-sm leading-7 text-gray-600">
            <p>
              Most grocery shops run on thin margins and long hours. Billing has
              to be fast, stock has to add up, and the owner needs to know how
              the day went without staying late with a notebook.
            </p>
            <p>
              We built {BRAND.name} around that counter: barcode and
              weighing-scale billing, UPI with the exact amount, a stock ledger
              that records every movement, and reports that compare today with
              yesterday.
            </p>
            <p>
              {BRAND.company} develops, hosts and supports the product. You can
              find us at{" "}
              <a
                href={BRAND.url}
                className="font-semibold text-[#4CAF50] hover:underline"
              >
                {BRAND.domain}
              </a>
              .
            </p>
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              "Offline-first billing",
              "Per-person pricing",
              "Setup help included",
              "Made for Indian stores",
            ].map((t) => (
              <li
                key={t}
                className="flex items-center gap-2 text-sm font-semibold text-gray-800"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#E8F5E9] text-[#4CAF50]">
                  <LuCheck size={14} aria-hidden />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Values */}
      <section className="sb-paper py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle eyebrow="Our values" title="What We Care About" />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {VALUES.map(({ icon: Icon, title, body }, i) => (
              <div
                key={title}
                data-reveal
                className={`sb-reveal relative overflow-hidden border-b-4 border-transparent p-7 text-center transition hover:-translate-y-1 hover:border-[#4CAF50] ${CARD}`}
                style={{ "--d": `${i * 100}ms` }}
              >
                <span
                  className="absolute right-4 top-2 text-6xl font-extrabold text-gray-100"
                  aria-hidden
                >
                  0{i + 1}
                </span>
                <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-full border-4 border-[#E8F5E9] bg-[#4CAF50] text-white">
                  <Icon size={26} aria-hidden />
                </span>
                <h3 className="relative mt-4 text-lg font-bold text-gray-900">
                  {title}
                </h3>
                <p className="relative mt-2 text-sm leading-6 text-gray-500">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Facts */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <div
          data-reveal
          className={`sb-reveal grid grid-cols-2 gap-3 p-4 md:grid-cols-4 ${CARD}`}
        >
          {FACTS.map((f) => (
            <div
              key={f.label}
              className={`rounded-lg p-5 text-center ${f.tint}`}
            >
              <p className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
                {f.value}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-600">
                {f.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <CtaBand />
    </SiteLayout>
  );
}
