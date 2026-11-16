// ==============================================
// src/lib/products.images.js
// ==============================================
//
// Where the hardware photos live, and how many each product has.
//
// ----------------------------------------------
// HOW THE PHOTOS ARE FOUND
// ----------------------------------------------
// The photos sit in the `public` folder, which Vite copies to the site
// root untouched. Files in `public` are *served at a URL* — they are not
// imported. So there are no `import ... from "./images/..."` lines here;
// each photo is just a path the browser fetches.
//
//     client/public/products/mj2806-1.png
//            ->  served at  /products/mj2806-1.png
//
// ----------------------------------------------
// NAMING
// ----------------------------------------------
// A photo is found by the product's id and its position:
//
//     <id>-1.png   <id>-2.png   <id>-3.png
//
// The id is the model in lower case with every run of non-alphanumeric
// characters turned into a single hyphen — exactly what products.config.js
// builds from `model`. For example:
//
//     MJ2806               ->  mj2806                ->  mj2806-1.png
//     MJ 2818D             ->  mj-2818d              ->  mj-2818d-1.png
//     SP-POS892UED         ->  sp-pos892ued          ->  sp-pos892ued-1.png
//     POS891UEBTDMWd Plus  ->  pos891uebtdmwd-plus   ->  pos891uebtdmwd-plus-1.png
//
// ----------------------------------------------
// ADDING OR REMOVING PHOTOS
// ----------------------------------------------
// 1. Drop the files into  client/public/products/  using the names above.
// 2. Set the count for that product in PHOTO_COUNT below. That is the only
//    edit needed — nothing in products.config.js changes.
//
// A product left out of PHOTO_COUNT falls back to the labelled sample
// image from `placeholder(...)` in products.config.js, so the page still
// works while photos are being shot. A file that is named here but not
// yet uploaded shows a quiet "Photo coming soon" panel rather than the
// browser's broken-image icon.
//

// ----------------------------------------------
// THE FOLDER
// ----------------------------------------------
// Change this one line if the photos live somewhere else. It must start
// with "/" — that is the site root, not a path on disk.
//
// If your folder is  client/public/images/products/  instead, either set
// BASE to "/images/products", or just leave this alone: ALT_BASE below is
// tried automatically whenever a photo fails to load, so both layouts
// work without an edit.

export const BASE = "/products";

// Tried once if BASE does not find the file. Set to null to switch off.
export const ALT_BASE = "/images/products";

const EXT = "webp";

/**
 * The same photo under the other folder, or null if there is no alternative.
 * The page calls this once when an image fails, before giving up.
 */
export const altSrc = (src) => {
  if (!ALT_BASE || typeof src !== "string") return null;
  if (!src.startsWith(`${BASE}/`)) return null;
  return `${ALT_BASE}/${src.slice(BASE.length + 1)}`;
};

// ==============================================
// HOW MANY PHOTOS EACH PRODUCT HAS
// ==============================================
//
// Keys are product ids, in lower case. Grouped by the category each
// product is given in products.config.js.

const PHOTO_COUNT = {
  // ---- Barcode scanners (21) ----
  "mj-2818d": 3,
  "mj-2818a": 3,
  "mj-2818c": 3,
  "sp-791": 3,
  mj2806: 3,
  mj2806at: 3,
  mj2880: 3,
  mj2870: 3,
  mj9520: 3,
  mj9220: 4, // this one has a fourth photo
  mj9320: 3,
  mj3850: 3,
  mj2290: 3,
  mj2850: 3,
  mj3650: 3,
  mj2816: 3,
  mj2840: 3,
  mj3670: 3,
  mj6600: 3,
  mj5200: 3,
  mj3660: 3,

  // ---- Receipt printers (5) ----
  "sp-pos892ued": 3,
  "sp-pos893usd": 3,
  "sp-pos894ued": 3,
  "sp-pos892ubtmm": 3,
  "pos891uebtdmwd-plus": 3,

  // ---- Mobile printers (2) ----
  "hop-e-300": 3,
  "hop-hl-58": 3,

  // ---- Cash drawers (5) ----
  "gs-405-a": 3,
  "gs-405-b": 3,
  "gs-406-a": 3,
  "gs-410-g": 3,
  "sp-335": 3,

  // ---- All-in-one POS (7) ----
  rs609p: 3,
  "mj-t2": 3,
  "mj-q6": 3,
  "mj-a9": 3,
  "mj-q8": 3,
  "mj-g300": 3,
  "mj-t215": 3,
};

// ==============================================
// THE REGISTRY
// ==============================================
//
// products.config.js reads PRODUCT_IMAGES and swaps these in for the
// sample images. Shape: product id -> array of image URLs.

export const PRODUCT_IMAGES = Object.fromEntries(
  Object.entries(PHOTO_COUNT).map(([id, count]) => [
    id,
    Array.from({ length: count }, (_, i) => `${BASE}/${id}-${i + 1}.${EXT}`),
  ]),
);

// Handy when you have an id and want the photos without reaching into the
// object: returns [] rather than undefined, so `.map` is always safe.
export const productImages = (id) => PRODUCT_IMAGES[id] ?? [];

export default PRODUCT_IMAGES;
