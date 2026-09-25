import { Link } from "react-router-dom";
import {
  LuArrowRight,
  LuChevronRight,
  LuLeaf,
  LuMail,
  LuMapPin,
} from "react-icons/lu";
import { BRAND } from "../../lib/brand";
import { SITE_IMAGES } from "../../lib/siteImages";
import { BrandMark } from "./BrandMark";
import { LOCATION, SITE_LINKS, SiteHeader, SUPPORT_EMAIL } from "./SiteHeader";
import { Eyebrow, Photo, SITE_STYLES, useRevealRoot } from "./theme";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden bg-[#111] text-white">
      <LuLeaf
        className="absolute -right-10 -top-10 text-white/[0.04]"
        size={260}
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.5fr_1fr_1fr_1.3fr]">
        <div>
          <BrandMark tone="light" />
          <p className="mt-4 max-w-xs text-sm leading-6 text-white/60">
            Billing, stock and daily reports for supermarkets and kirana stores.
            Built and supported by {BRAND.company}.
          </p>
          <Link
            to="/signup"
            className="mt-5 inline-flex items-center gap-1.5 rounded bg-[#FF7B29] px-4 py-2 text-xs font-bold hover:bg-[#f06a17]"
          >
            Start free <LuArrowRight aria-hidden />
          </Link>
        </div>

        <FooterList
          title="Product"
          links={SITE_LINKS.map(({ to, label }) => [to, label])}
        />
        <FooterList
          title="Account"
          links={[
            ["/login", "Sign in"],
            ["/signup", "Start free"],
            ["/pricing", "Plans"],
          ]}
        />

        <div>
          <h2 className="text-base font-bold">Contact</h2>
          <span className="mt-2 block h-0.5 w-8 bg-[#4CAF50]" aria-hidden />
          <ul className="mt-4 space-y-3 text-sm text-white/60">
            <li>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="inline-flex items-center gap-2 hover:text-white"
              >
                <LuMail className="text-[#4CAF50]" aria-hidden />{" "}
                {SUPPORT_EMAIL}
              </a>
            </li>
            <li className="inline-flex items-center gap-2">
              <LuMapPin className="text-[#4CAF50]" aria-hidden /> {LOCATION}
            </li>
          </ul>
        </div>
      </div>

      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-white/50 sm:flex-row sm:justify-between sm:px-6">
          <span>
            © {year} {BRAND.fullName}. All rights reserved.
          </span>
          <a href={BRAND.url} className="hover:text-white">
            {BRAND.domain}
          </a>
        </div>
      </div>
    </footer>
  );
}

function FooterList({ title, links }) {
  return (
    <div>
      <h2 className="text-base font-bold">{title}</h2>
      <span className="mt-2 block h-0.5 w-8 bg-[#4CAF50]" aria-hidden />
      <ul className="mt-4 space-y-2.5 text-sm text-white/60">
        {links.map(([to, label]) => (
          <li key={to + label}>
            <Link
              to={to}
              className="inline-flex items-center gap-1 transition hover:translate-x-0.5 hover:text-white"
            >
              <LuChevronRight
                size={14}
                className="text-[#4CAF50]"
                aria-hidden
              />{" "}
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Header + page content + footer, used by every public page. Also turns on scroll reveal. */
export function SiteLayout({ children, className = "bg-[#FBFAF8]" }) {
  const revealRef = useRevealRoot();
  return (
    <div className={`flex min-h-[100dvh] flex-col ${className}`}>
      <style>{SITE_STYLES}</style>
      <SiteHeader />
      <main ref={revealRef} className="flex-1 overflow-x-clip">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * Banner at the top of inner pages: cream paper, breadcrumb, big title,
 * and an optional round photo on a green panel (large screens) like the home page.
 */
export function PageIntro({
  title,
  children,
  eyebrow,
  crumb,
  image,
  imageAlt = "",
}) {
  return (
    <section className="sb-paper relative overflow-hidden">
      {image ? (
        <div
          className="absolute inset-y-0 right-0 hidden w-[34%] bg-[#4CAF50] lg:block"
          aria-hidden
        >
          <LuLeaf
            className="absolute bottom-6 right-6 text-white/15"
            size={140}
          />
        </div>
      ) : null}
      <LuLeaf
        className="absolute left-4 top-4 text-[#FF7B29]/15"
        size={100}
        aria-hidden
      />

      <div
        className={`relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 ${
          image ? "lg:grid-cols-[1.4fr_1fr]" : ""
        }`}
      >
        <div
          data-reveal
          className={`sb-reveal ${image ? "" : "mx-auto max-w-2xl text-center"}`}
        >
          <nav
            aria-label="Breadcrumb"
            className={`flex items-center gap-1.5 text-xs font-semibold text-gray-500 ${image ? "" : "justify-center"}`}
          >
            <Link to="/" className="hover:text-[#4CAF50]">
              Home
            </Link>
            <LuChevronRight aria-hidden />
            <span className="text-[#4CAF50]">{crumb ?? title}</span>
          </nav>
          {eyebrow ? (
            <div className="mt-4">
              <Eyebrow center={!image}>{eyebrow}</Eyebrow>
            </div>
          ) : null}
          <h1 className="mt-2 text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl">
            {title}
          </h1>
          {children ? (
            <p
              className={`mt-4 text-base leading-7 text-gray-600 ${image ? "max-w-xl" : "mx-auto max-w-xl"}`}
            >
              {children}
            </p>
          ) : null}
        </div>

        {image ? (
          <div
            data-reveal
            className="sb-reveal relative mx-auto hidden w-full max-w-xs sm:block"
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
              <div className="sb-float absolute inset-[10%] overflow-hidden rounded-full border-8 border-white bg-white shadow-2xl">
                <Photo
                  src={image}
                  alt={imageAlt}
                  eager
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** The green "start free" band that closes most pages. */
export function CtaBand({
  title = "Try it on your counter for a month, free",
  body,
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div
        data-reveal
        className="sb-reveal relative overflow-hidden rounded-xl bg-[#4CAF50] px-6 py-12 text-white sm:px-12"
      >
        <LuLeaf
          className="absolute -left-6 -top-6 text-white/10"
          size={160}
          aria-hidden
        />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div className="text-center lg:text-left">
            <Eyebrow center light>
              Start today
            </Eyebrow>
            <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              {title}
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-white/85 lg:mx-0">
              {body ??
                "Set up your products, run real bills, and see the numbers at closing. Pay only if it earns its place."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link
                to="/signup"
                className="inline-flex items-center gap-1.5 rounded bg-[#FF7B29] px-5 py-3 text-sm font-bold shadow-lg shadow-black/10 hover:bg-[#f06a17]"
              >
                Create your store <LuArrowRight aria-hidden />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center rounded border border-white/60 px-5 py-3 text-sm font-bold hover:bg-white/10"
              >
                See pricing
              </Link>
            </div>
          </div>
          <div className="relative mx-auto hidden aspect-square w-56 lg:block">
            <div
              className="sb-splash absolute inset-0 bg-[#FF7B29]"
              aria-hidden
            />
            <div className="absolute inset-[9%] overflow-hidden rounded-full border-8 border-white">
              <Photo
                src={SITE_IMAGES.heroAlt}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
