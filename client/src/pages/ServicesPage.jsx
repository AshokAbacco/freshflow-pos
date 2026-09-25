import { Link } from "react-router-dom";
import {
  LuChevronRight,
  LuDatabase,
  LuGraduationCap,
  LuHeadphones,
  LuLeaf,
  LuPrinter,
  LuStore,
  LuWrench,
} from "react-icons/lu";
import { CtaBand, SiteLayout } from "../components/site/SiteFooter";
import { CARD, Eyebrow, Photo, SectionTitle } from "../components/site/theme";
import { BRAND } from "../lib/brand";
import { SITE_IMAGES } from "../lib/siteImages";

// NOTE: review this list against what Abacco actually offers before going live.
const SERVICES = [
  {
    icon: LuStore,
    title: "Store setup",
    body: "We create your store, registers and staff accounts with you, so the first bill goes through on day one.",
  },
  {
    icon: LuDatabase,
    title: "Product list import",
    body: "Send us your existing item list or spreadsheet. We bring in names, codes, prices and categories for you.",
  },
  {
    icon: LuPrinter,
    title: "Hardware setup",
    body: "Help connecting barcode scanners, USB weighing scales and receipt printers to your tills.",
  },
  {
    icon: LuGraduationCap,
    title: "Staff training",
    body: "A short walkthrough for cashiers on billing and payments, and for owners on stock and reports.",
  },
  {
    icon: LuWrench,
    title: "Custom categories and pricing",
    body: "We set up categories, loose-item quick codes and prices the way your shelves are organised.",
  },
  {
    icon: LuHeadphones,
    title: "Ongoing support",
    body: `Questions after go-live go straight to the ${BRAND.company} team.`,
  },
];

// These really are steps in order, so they are numbered.
const STEPS = [
  {
    title: "Talk to us",
    body: "Tell us how many counters you run and what hardware you already have.",
    img: SITE_IMAGES.heroAlt,
  },
  {
    title: "We set it up",
    body: "Products, categories, staff accounts and devices, ready before you open.",
    img: SITE_IMAGES.familyStore,
  },
  {
    title: "Start billing",
    body: "Run real bills during your free month. We stay on hand for questions.",
    img: SITE_IMAGES.fastCheckout,
  },
];

/**
 * Hero for this page only. Same look as the shared PageIntro banner, but with the transparent
 * PNG from /public standing on the bottom edge of the section instead of a round framed photo.
 * The section clips the image at its bottom edge and the last part fades out, so the cropped
 * edge of the photo is never visible.
 */
function ServicesHero() {
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
            <span className="text-[#4CAF50]">Services</span>
          </nav>
          <div className="mt-4">
            <Eyebrow>How we help</Eyebrow>
          </div>
          <h1 className="mt-2 text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl">
            We Help You Get the Counter Running
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-gray-600">
            The software is yours to set up alone if you like. If you would
            rather have help, the {BRAND.company} team can do the setup with
            you.
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
              src="/services-hero-img.png"
              alt="Our team helping a store get set up"
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

export default function ServicesPage() {
  return (
    <SiteLayout>
      <ServicesHero />

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionTitle
          eyebrow="Our services"
          title="Setup, Hardware and Support"
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              data-reveal
              className={`sb-reveal group relative overflow-hidden p-7 transition hover:-translate-y-1 ${CARD}`}
              style={{ "--d": `${(i % 3) * 90}ms` }}
            >
              <Icon
                className="absolute -bottom-4 -right-4 text-gray-100 transition group-hover:text-[#E8F5E9]"
                size={110}
                aria-hidden
              />
              <span
                className={`relative grid h-14 w-14 place-items-center rounded-full text-white ${
                  i % 2 ? "bg-[#FF7B29]" : "bg-[#4CAF50]"
                }`}
              >
                <Icon size={24} aria-hidden />
              </span>
              <h3 className="relative mt-5 text-lg font-bold capitalize text-gray-900">
                {title}
              </h3>
              <p className="relative mt-2 text-sm leading-6 text-gray-500">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="sb-paper py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle
            eyebrow="Getting started"
            title="Three Steps to Your First Bill"
          />
          <ol className="relative mt-14 grid gap-10 md:grid-cols-3">
            {/* Dashed line joining the steps on wide screens */}
            <span
              className="absolute left-[16%] right-[16%] top-16 hidden border-t-2 border-dashed border-[#FF7B29]/40 md:block"
              aria-hidden
            />
            {STEPS.map(({ title, body, img }, i) => (
              <li
                key={title}
                data-reveal
                className="sb-reveal relative text-center"
                style={{ "--d": `${i * 120}ms` }}
              >
                <div className="relative mx-auto h-32 w-32">
                  <div className="h-full w-full overflow-hidden rounded-full border-8 border-white shadow-xl">
                    <Photo
                      src={img}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <span className="absolute -right-1 top-0 grid h-10 w-10 place-items-center rounded-full bg-[#FF7B29] text-sm font-extrabold text-white shadow-lg">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-bold text-gray-900">
                  {title}
                </h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-gray-500">
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CtaBand title="Start free, and ask for help when you need it" />
    </SiteLayout>
  );
}
