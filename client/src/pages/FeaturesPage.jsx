import { Link } from "react-router-dom";
import {
  LuChartColumn,
  LuChevronRight,
  LuCloudUpload,
  LuCreditCard,
  LuLeaf,
  LuPackage,
  LuPrinter,
  LuQrCode,
  LuScale,
  LuScanBarcode,
  LuShieldCheck,
  LuTags,
  LuUsers,
  LuWifiOff,
} from "react-icons/lu";
import { CtaBand, SiteLayout } from "../components/site/SiteFooter";
import { CARD, Eyebrow, Photo } from "../components/site/theme";
import { BRAND } from "../lib/brand";
import { SITE_IMAGES } from "../lib/siteImages";

// Grouped by where in the shop the feature is used, so an owner can find "the counter" or "the back office" quickly.
const GROUPS = [
  {
    eyebrow: "At the counter",
    title: "Everything the Cashier Touches",
    body: "Everything a cashier touches while a customer waits.",
    image: SITE_IMAGES.fastCheckout,
    items: [
      {
        icon: LuScanBarcode,
        title: "Barcode and quick-code billing",
        body: "Scan packaged goods or type a short code for loose items. Repeat items stack on one line.",
      },
      {
        icon: LuScale,
        title: "Weighing scale support",
        body: "Read weight straight from a USB scale, with tare. Type the weight by hand when the scale is elsewhere.",
      },
      {
        icon: LuQrCode,
        title: "UPI QR for the exact amount",
        body: "The customer scans a QR that already holds the bill total, so nobody types the amount wrong.",
      },
      {
        icon: LuCreditCard,
        title: "Cash and card",
        body: "Enter cash tendered and the change is worked out for you.",
      },
      {
        icon: LuPrinter,
        title: "Printed receipts",
        body: "Print a receipt for every bill, with your store name at the top.",
      },
      {
        icon: LuWifiOff,
        title: "Billing without internet",
        body: "The till keeps every bill on the device and uploads it when the connection returns.",
      },
    ],
  },
  {
    eyebrow: "In the back office",
    title: "For Owners and Managers",
    body: "Stock, prices and reports, kept out of the cashier’s view.",
    image: SITE_IMAGES.familyStore,
    items: [
      {
        icon: LuPackage,
        title: "Stock ledger",
        body: "Sales, returns and deliveries each move stock and leave a record with the reason.",
      },
      {
        icon: LuTags,
        title: "Your own categories and prices",
        body: "Set up categories the way your shelves are laid out and change prices in one place.",
      },
      {
        icon: LuChartColumn,
        title: "Daily and period reports",
        body: "Revenue, basket size, top categories and products, compared with the period before.",
      },
    ],
  },
  {
    eyebrow: "Across the store",
    title: "More Than One Till or Person",
    body: "For shops with several counters and a team behind them.",
    image: SITE_IMAGES.farmers,
    items: [
      {
        icon: LuUsers,
        title: "Cashier and admin roles",
        body: "Cashiers get the register only. Admins get reports, stock, pricing, billing and the team list.",
      },
      {
        icon: LuCloudUpload,
        title: "Several registers, one set of books",
        body: "Every till syncs to the same stock and the same reports.",
      },
      {
        icon: LuShieldCheck,
        title: "Sign-in for every staff member",
        body: "Each person has their own account, so every bill shows who rang it up.",
      },
    ],
  },
];

/**
 * Hero for this page only. Same look as the shared PageIntro banner, but with the transparent
 * PNG from /public standing on the bottom edge of the section instead of a round framed photo.
 * The section clips the image at its bottom edge and the last part fades out, so the cropped
 * edge of the photo is never visible.
 */
function FeaturesHero() {
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
            <span className="text-[#4CAF50]">Features</span>
          </nav>
          <div className="mt-4">
            <Eyebrow>What you get</Eyebrow>
          </div>
          <h1 className="mt-2 text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl">
            Everything Your Counter Needs
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-gray-600">
            {BRAND.name} covers billing, stock and reports for a single-till
            kirana or a supermarket with several counters.
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
              src="/features-secation-img.png"
              alt="Shopper holding a bag of fresh groceries"
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

export default function FeaturesPage() {
  return (
    <SiteLayout>
      <FeaturesHero />

      {GROUPS.map((group, gi) => (
        <section
          key={group.title}
          className={gi % 2 ? "sb-paper py-20" : "py-20"}
          aria-labelledby={`g-${gi}`}
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid items-end gap-8 lg:grid-cols-[1.4fr_1fr]">
              <div data-reveal className="sb-reveal">
                <Eyebrow>{group.eyebrow}</Eyebrow>
                <h2
                  id={`g-${gi}`}
                  className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
                >
                  {group.title}
                </h2>
                <p className="mt-3 max-w-lg text-sm leading-7 text-gray-600">
                  {group.body}
                </p>
              </div>
              <div
                data-reveal
                className="sb-reveal hidden h-32 overflow-hidden rounded-xl lg:block"
                style={{ "--d": "120ms" }}
              >
                <Photo
                  src={group.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map(({ icon: Icon, title, body }, i) => (
                <li
                  key={title}
                  data-reveal
                  className={`sb-reveal group border-b-4 border-transparent p-6 transition hover:-translate-y-1 hover:border-[#4CAF50] ${CARD}`}
                  style={{ "--d": `${(i % 3) * 90}ms` }}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-[#E8F5E9] text-[#4CAF50] transition group-hover:bg-[#4CAF50] group-hover:text-white">
                    <Icon size={22} aria-hidden />
                  </span>
                  <h3 className="mt-4 font-bold text-gray-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-gray-500">
                    {body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <CtaBand />
    </SiteLayout>
  );
}
