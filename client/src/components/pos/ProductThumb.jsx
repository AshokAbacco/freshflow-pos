import { useState } from "react";

export function ProductThumb({ src, name, className = "" }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`grid h-full w-full place-items-center bg-surface-sunk text-h2 font-extrabold text-ink-faint ${className}`}
        aria-hidden
      >
        {name?.[0]?.toUpperCase() ?? "?"}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
