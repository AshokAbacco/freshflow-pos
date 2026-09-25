import { Link } from "react-router-dom";
import { LuShoppingCart } from "react-icons/lu";
import { BRAND } from "../../lib/brand";

/**
 * Logo + name.
 *  variant="block"  green slanted block (site header)
 *  tone="light"     white text, for dark or green backgrounds (footer)
 *  showCompany      adds the small "by Abacco" line
 */
export function BrandMark({
  tone = "dark",
  showCompany = true,
  to = "/",
  variant = "plain",
}) {
  if (variant === "block") {
    return (
      <Link
        to={to}
        aria-label={`${BRAND.fullName}, home`}
        className="flex h-full items-center gap-2.5 bg-[#4CAF50] py-3 pl-4 pr-9 text-white transition hover:bg-[#43a047] [clip-path:polygon(0_0,100%_0,calc(100%_-_22px)_100%,0_100%)] sm:pl-5 sm:pr-11"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#4CAF50]">
          <LuShoppingCart size={18} aria-hidden />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-base font-extrabold tracking-tight sm:text-lg">
            {BRAND.name}
          </span>
          {showCompany ? (
            <span className="text-[11px] font-medium text-white/80">
              by {BRAND.company}
            </span>
          ) : null}
        </span>
      </Link>
    );
  }

  const light = tone === "light";
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5"
      aria-label={`${BRAND.fullName}, home`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
          light ? "bg-[#4CAF50] text-white" : "bg-[#4CAF50] text-white"
        }`}
      >
        <LuShoppingCart size={18} aria-hidden />
      </span>
      <span className="flex flex-col leading-tight">
        <span
          className={`text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-gray-900"}`}
        >
          {BRAND.name}
        </span>
        {showCompany ? (
          <span
            className={`text-[11px] font-medium ${light ? "text-white/60" : "text-gray-500"}`}
          >
            by {BRAND.company}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
