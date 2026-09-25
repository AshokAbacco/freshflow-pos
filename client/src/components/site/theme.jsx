import { useEffect, useRef, useState } from "react";
import { LuArrowRight } from "react-icons/lu";

/*
  The public site's look, shared by every page:
  green #4CAF50, orange #FF7B29, cream paper #F7F2EC, near-black #111.
*/

export const SITE_STYLES = `
  .sb-reveal { opacity: 0; transform: translateY(28px); transition: opacity .8s ease, transform .8s cubic-bezier(.2,.8,.2,1); transition-delay: var(--d, 0ms); }
  .sb-reveal.is-visible { opacity: 1; transform: none; }

  .sb-paper {
    background-color: #F7F2EC;
    background-image: radial-gradient(rgba(0,0,0,.035) 1px, transparent 1px);
    background-size: 6px 6px;
  }

  .sb-splash {
    clip-path: polygon(8% 18%, 18% 4%, 30% 12%, 44% 0%, 56% 10%, 70% 2%, 80% 14%, 94% 8%, 92% 24%, 100% 36%,
      90% 48%, 100% 62%, 88% 72%, 96% 88%, 80% 90%, 70% 100%, 58% 90%, 44% 100%, 32% 90%, 18% 98%, 14% 84%,
      0% 76%, 8% 62%, 0% 48%, 10% 38%, 0% 26%);
  }

  @keyframes sb-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
  .sb-float { animation: sb-float 6s ease-in-out infinite; }

  @media (prefers-reduced-motion: reduce) {
    .sb-reveal { opacity: 1; transform: none; transition: none; }
    .sb-float { animation: none; }
  }
`;

/**
 * Returns a ref for a wrapper element. Anything inside it with `data-reveal` and the `sb-reveal`
 * class fades up as it scrolls into view, including elements that appear later (e.g. after data loads).
 */
export function useRevealRoot() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const show = (el) => el.classList.add("is-visible");
    const io =
      !reduce && "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) =>
              entries.forEach((e) => {
                if (e.isIntersecting) {
                  show(e.target);
                  io.unobserve(e.target);
                }
              }),
            { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
          )
        : null;
    const seen = new WeakSet();
    const scan = () =>
      root.querySelectorAll("[data-reveal]").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (io) io.observe(el);
        else show(el);
      });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io?.disconnect();
    };
  }, []);
  return ref;
}

/** The small orange italic label with a line and arrow, above headings. */
export function Eyebrow({ children, center = false, light = false }) {
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

export function SectionTitle({ eyebrow, title, sub, align = "center", as: Tag = "h2" }) {
  const center = align === "center";
  return (
    <div data-reveal className={`sb-reveal ${center ? "mx-auto max-w-2xl text-center" : "max-w-xl"}`}>
      {eyebrow ? <Eyebrow center={center}>{eyebrow}</Eyebrow> : null}
      <Tag className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">{title}</Tag>
      {sub ? (
        <p className={`mt-3 text-sm leading-7 text-gray-600 ${center ? "mx-auto max-w-lg" : ""}`}>{sub}</p>
      ) : null}
    </div>
  );
}

/** An image that falls back to a soft tint if the remote host refuses to serve it. */
export function Photo({ src, alt, className = "", eager = false }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div role="img" aria-label={alt} className={`${className} bg-gradient-to-br from-[#E8F5E9] to-[#FFF1E6]`} />
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

/** White card with the soft shadow used everywhere on the site. */
export const CARD = "rounded-lg bg-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5";
