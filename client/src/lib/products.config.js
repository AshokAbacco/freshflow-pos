// ==============================================
// src/lib/products.config.js
// ==============================================
//
// Everything the Products page shows lives here: the enquiry number, the
// categories, and every product. The page component has no copy in it.
//
// Prices are deliberately absent. Visitors enquire instead, and the
// WhatsApp message carries the product they picked.
//
// ----------------------------------------------
// REPLACING THE DUMMY IMAGES
// ----------------------------------------------
// Every product falls back to `placeholder(...)`, which draws a labelled
// sample image in SVG, so nothing needs to be downloaded. When you have
// real photos, add them in ./products.images.js. They replace the sample
// image automatically.
//

// Images are now registered in  ./products.images.js  (see the steps at
// the top of that file). Products without photos fall back to the sample
// image from `placeholder(...)`, so nothing needs to be edited in here.

import { PRODUCT_IMAGES } from "./products.images";

// ==============================================
// CONTACT
// ==============================================

export const PRODUCT_CONTACT = {
  // Shown on buttons and in the footer strip.
  phoneDisplay: "+91 72049 86825",
  // For tel: links.
  phoneTel: "+917204986825",
  // For wa.me links: country code + number, digits only.
  whatsapp: "917204986825",
  company: "Abacco Technology",
};

// ==============================================
// PAGE COPY
// ==============================================

export const PRODUCTS_PAGE = {
  title: "Hardware for the counter and the kitchen",
  intro:
    "Barcode scanners, receipt printers, cash drawers and touch POS terminals. Open any product for the full specifications, then enquire on WhatsApp and we'll reply with availability and the right option for your outlet.",
  searchPlaceholder: "Search by name or model",
  empty:
    "No products match that search. Clear it, or ask us on WhatsApp and we'll find the right one.",
  helpTitle: "Not sure which one fits your outlet?",
  helpBody:
    "Tell us your counter setup and how many orders you take on a busy night. We'll suggest the printer, scanner and drawer that work together.",
};

// ==============================================
// CATEGORIES
// ==============================================

export const PRODUCT_CATEGORIES = [
  {
    id: "scanners",
    label: "Barcode scanners",
    blurb: "Handheld, desktop and hands-free readers for 1D and 2D codes.",
  },
  {
    id: "printers",
    label: "Receipt printers",
    blurb: "80 mm thermal printers for bills and kitchen tickets.",
  },
  {
    id: "mobile-printers",
    label: "Mobile printers",
    blurb: "Battery-powered printers for takeaway, delivery and table service.",
  },
  {
    id: "drawers",
    label: "Cash drawers",
    blurb: "Drawers that pop open when the bill prints.",
  },
  {
    id: "pos",
    label: "All-in-one POS",
    blurb: "Touch terminals with the screen and computer in one unit.",
  },
];

export const categoryLabel = (id) =>
  PRODUCT_CATEGORIES.find((c) => c.id === id)?.label ?? "";

// ==============================================
// PLACEHOLDER IMAGES
// ==============================================

const VIEWS = [
  "Front view",
  "Side view",
  "Ports and rear",
  "In use at the counter",
];
const TINTS = [
  ["#F3F5EE", "#DCE8D5"],
  ["#EEF3EA", "#CFE0C8"],
  ["#F6F6EE", "#E1E7D2"],
  ["#EDF2EC", "#D3E3D0"],
];

const escapeXml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const placeholder = (label, count = 4) =>
  Array.from({ length: count }, (_, i) => {
    const [from, to] = TINTS[i % TINTS.length];
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
      `</linearGradient></defs>` +
      `<rect width="800" height="600" fill="url(#g)"/>` +
      `<rect x="250" y="170" width="300" height="190" rx="22" fill="#171C17" opacity="0.88"/>` +
      `<rect x="280" y="200" width="240" height="70" rx="10" fill="#3FA34D" opacity="0.9"/>` +
      `<rect x="330" y="360" width="140" height="26" rx="8" fill="#171C17" opacity="0.7"/>` +
      `<text x="400" y="440" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#171C17">${escapeXml(label)}</text>` +
      `<text x="400" y="480" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#6B7280">${escapeXml(VIEWS[i % VIEWS.length])} · sample image</text>` +
      `</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

// ==============================================
// SHARED SPEC FRAGMENTS
// ==============================================

const DECODING =
  "UPC/EAN with complementary, UPC/EAN, Code128, Code39, Code 39 Full ASCII, Codabar, Industrial / Interleaved 2 of 5, Code93, MSI, Code11, ISBN, ISSN, China Post";

const CERTS = "CE, FCC, RoHS, BIS";

const PRINTER_COMMON = [
  ["Printing method", "Thermal line"],
  ["Printing width", "72 mm"],
  ["Paper diameter", "72 mm"],
  ["Paper thickness", "0.06 mm – 0.08 mm"],
  ["Line spacing", "3.75 mm"],
  ["Paper width", "79.5 ± 0.5 mm"],
  ["Cash drawer output", "DC 24 V / 2 A"],
  ["Print head life", "150 km"],
  ["Cutter life", "1,500,000 times"],
  ["Driver", "Android, Windows, iOS, Linux"],
  ["Protection", "IP54"],
  ["Certifications", "CE, FCC, RoHS, BIS, ISO"],
];

const DRAWER_COMMON = [
  [
    "Operation",
    "RJ11 port to connect with a printer for automatic open; manual open optional",
  ],
  ["Power", "DC 12 V"],
  ["Cash clips", "Stainless steel"],
  ["Ideal usage", "Currency notes, coins, cheques"],
];

const DRAWER_FEATURES = [
  "Heavy-duty metal frame with a matte finish and round corners",
  "Opens automatically when the printer prints a bill",
  "Key lock with manual open as a backup",
  "Rubber stand keeps it steady on the counter",
  "No installation needed beyond the printer cable",
];

const POS_FEATURES = [
  "Ten-point capacitive touch screen",
  "Single or double screen, your choice",
  "Works with mainstream POS management software",
  "Quick setup for inventory, sales statistics and order management",
  "CPU, RAM and SSD can be customised",
];

const POS_SPECS = [
  ["Touch screen", "Ten-point capacitive"],
  ["Screen options", "Single or double screen"],
  ["Customisation", "CPU, RAM and SSD can be customised"],
  ["Software", "Compatible with mainstream POS management software"],
];

// ==============================================
// PRODUCT HELPERS
// ==============================================

// The catalogue sheets for the remaining scanners list a short bullet set,
// so they share one compact shape.
const scanner = ({ model, name, tagline, summary, features, specs = [] }) => ({
  id: model.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  brand: "Gobbler",
  model,
  name,
  category: "scanners",
  tagline,
  summary,
  highlights: features.slice(0, 3),
  features,
  specs: [...specs],
  images: placeholder(model),
});

const posTerminal = ({ model, tagline, extra = [] }) => ({
  id: model.toLowerCase(),
  brand: "MJ Series",
  model,
  name: `${model} All-in-one POS`,
  category: "pos",
  tagline,
  summary:
    "A touch-screen POS terminal that puts the screen, computer and ordering software on one counter-top unit. It works with mainstream POS management software, so inventory, sales statistics and order management are quick to set up.",
  highlights: [
    "Ten-point touch",
    "Single or dual screen",
    "Customisable CPU/RAM/SSD",
  ],
  features: POS_FEATURES,
  specs: [...extra, ...POS_SPECS],
  images: placeholder(model),
});

const drawer = ({ model, color, size, tray, weight, brand = "Gobbler" }) => ({
  id: model.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  brand,
  model,
  name: `Cash drawer ${model}`,
  category: "drawers",
  tagline: `${color} drawer, ${tray}`,
  summary:
    "A sturdy cash drawer that connects to your receipt printer and pops open when a bill prints. Separate slots for notes and coins keep the till tidy during a rush.",
  highlights: [`${color}`, tray, `${weight}`],
  features: DRAWER_FEATURES,
  specs: [
    ["Size (W × L × H)", size],
    ["Cash tray", tray],
    ["Colour", color],
    ["Weight", weight],
    ...DRAWER_COMMON,
  ],
  images: placeholder(model),
});

// ==============================================
// PRODUCTS
// ==============================================

const RAW_PRODUCTS = [
  // ------------------------------------------
  // BARCODE SCANNERS — detailed sheets
  // ------------------------------------------
  {
    id: "mj-2818d",
    brand: "Gobbler",
    model: "MJ 2818D",
    name: "Orbit Scanner",
    category: "scanners",
    tagline: "Hands-free, omni-directional desktop scanner",
    summary:
      "A stand-mounted orbit scanner that reads barcodes from any direction. Hold the item in front of it and it scans, which keeps a busy billing counter moving. Sunlight and shop lighting don't affect it.",
    highlights: [
      "Omni-directional CMOS",
      "1100 scan lines/sec",
      "USB plug and play",
    ],
    features: [
      "Reads in every direction, so items don't need to be lined up",
      "1100 scan lines per second",
      "35 cm scanning width",
      "Buzzer and LED confirm every read",
      "Industrial lighting or sunlight makes no difference",
      "IP54 protection and a 1.2 m drop rating",
    ],
    specs: [
      ["CPU", "ARM 32-bit Cortex"],
      ["Light source", "650 nm visible laser diode"],
      ["Indication", "Buzzer and LED"],
      ["Resolution", "5 – 10 mil"],
      ["Decoding speed", "1100 scan lines/sec"],
      ["Scanning width", "35 cm"],
      ["Scanning type", "Omni-directional, CMOS"],
      ["Button life", "500,000 times"],
      [
        "Anti-interference",
        "Industrial lighting or sunlight makes no difference",
      ],
      ["Scanning angle", "Tilt ± 180°, Skew ± 40°, Pitch ± 60°"],
      ["Drop test", "1.2 m"],
      ["Interface", "USB"],
      ["Dimensions", "97 × 104 × 145 mm"],
      ["Weight", "120 g"],
      ["Protection", "IP54"],
      ["Certifications", CERTS + ", ISO"],
      ["Decoding capability", DECODING],
    ],
    images: placeholder("MJ2818D"),
  },
  {
    id: "mj-2818a",
    brand: "Gobbler",
    model: "MJ 2818A",
    name: "2D Wired Barcode Scanner",
    category: "scanners",
    tagline: "Handheld USB scanner for the billing counter",
    summary:
      "A wired handheld scanner that reads 1D and 2D codes quickly and survives the daily knocks of a counter. Plug it into USB and it works as a keyboard, with no driver to install.",
    highlights: ["200 scans/sec", "USB wired", "1.5 m drop-proof"],
    features: [
      "200 scans per second",
      "35 cm scanning width",
      "Bi-directional scanning",
      "Survives a 1.5 m fall to concrete",
      "Buzzer and LED confirm every read",
      "Industrial lighting or sunlight makes no difference",
    ],
    specs: [
      ["CPU", "ARM 32-bit Cortex"],
      ["Light source", "650 nm visible laser diode"],
      ["Indication", "Buzzer and LED"],
      ["Resolution", "5 mil"],
      ["Decoding speed", "200 scans/sec"],
      ["Scanning width", "35 cm"],
      ["Scanning type", "Bi-directional"],
      ["Button life", "500,000 times"],
      [
        "Anti-interference",
        "Industrial lighting or sunlight makes no difference",
      ],
      ["Scanning angle", "Tilt ± 180°, Skew ± 40°, Pitch ± 60°"],
      ["Drop test", "1.5 m fall to concrete"],
      ["Interface", "USB (wired)"],
      ["Dimensions", "90 × 67 × 168 mm"],
      ["Weight", "120 g"],
      ["Protection", "IP54"],
      ["Certifications", CERTS + ", ISO"],
      ["Decoding capability", DECODING],
    ],
    images: placeholder("mj2818d1"),
  },
  {
    id: "mj-2818c",
    brand: "Gobbler",
    model: "MJ 2818 C",
    name: "2D Wireless Barcode and QR Code Scanner",
    category: "scanners",
    tagline: "Cordless scanner with a 2.4 GHz USB receiver",
    summary:
      "A wireless handheld scanner for barcodes and QR codes. Plug the small receiver into the billing computer and walk around the shop or store room with the scanner. It can also be used wired over USB.",
    highlights: ["Barcode and QR", "60 m indoor range", "2 m drop-proof"],
    features: [
      "Reads barcodes and QR codes",
      "2.4 GHz wireless: 60 m indoors, 100 m outdoors",
      "200 scans per second",
      "Survives a 2 m fall to concrete",
      "Can also be used wired over USB",
      "Industrial lighting or sunlight makes no difference",
    ],
    specs: [
      ["CPU", "ARM 32-bit Cortex"],
      ["Light source", "650 nm visible laser diode"],
      ["Indication", "Buzzer and LED"],
      ["Resolution", "5 mil"],
      ["Decoding speed", "200 scans/sec"],
      ["Scanning width", "35 cm"],
      ["Scanning type", "Bi-directional"],
      ["Button life", "500,000 times"],
      [
        "Anti-interference",
        "Industrial lighting or sunlight makes no difference",
      ],
      ["Scanning angle", "Skew ± 60°, Pitch ± 65°"],
      ["Drop test", "2 m fall to concrete"],
      ["Interface", "USB, with 2.4 GHz wireless receiver"],
      ["Communication distance", "60 m indoor, 100 m outdoor"],
      ["Dimensions", "156 × 67 × 89 mm"],
      ["Weight", "150 g"],
      ["Protection", "IP54"],
      ["Certifications", CERTS + ", ISO"],
      ["Decoding capability", DECODING],
    ],
    images: placeholder("MJ 2818 C"),
  },
  {
    id: "sp-791",
    brand: "SPRT",
    model: "SP-791",
    name: "Handheld Barcode Scanner",
    category: "scanners",
    tagline: "Light, wired scanner in black and blue",
    summary:
      "A simple wired handheld scanner for everyday billing. LED and buzzer feedback tell the cashier a code has been read.",
    highlights: ["ABS + PC body", "LED and buzzer", "USB Type B"],
    features: [
      "Black and blue ABS + PC body",
      "LED light and buzzer confirm each read",
      "USB interface",
    ],
    specs: [
      ["Colour", "Black and blue"],
      ["Material", "ABS + PC"],
      ["Interface", "USB Type B (optional)"],
      ["Reading indicators", "LED light and buzzer"],
    ],
    images: placeholder("SP-791"),
  },

  // ------------------------------------------
  // BARCODE SCANNERS — catalogue range
  // ------------------------------------------
  scanner({
    model: "MJ2806",
    name: "1D Laser Wired Barcode Scanner",
    tagline: "Entry-level wired laser scanner",
    summary:
      "A wired laser scanner for 1D barcodes. Plug and play, with support for multiple keyboard language layouts.",
    features: [
      "200 times/sec scanning speed",
      "Works with multiple language layouts, plug and play",
      "1.5 m drop test",
      "Can be switched to manual or continuous scanning",
    ],
    specs: [
      ["Type", "1D laser, wired"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ2806AT",
    name: "1D Laser Wired Barcode Scanner with Stand",
    tagline: "Wired laser scanner with a hands-free stand",
    summary:
      "The MJ2806 with a stand, so it can sit on the counter and scan items passed in front of it, or be lifted off for handheld use.",
    features: [
      "200 times/sec scanning speed",
      "Works with multiple language layouts, plug and play",
      "1.5 m drop test",
      "Comes with a stand; switch easily between auto-sense and manual mode",
    ],
    specs: [
      ["Type", "1D laser, wired, with stand"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ2880",
    name: "2D Bluetooth Wireless Barcode Scanner",
    tagline: "Bluetooth and wired in one scanner",
    summary:
      "A 2D scanner that connects over Bluetooth or a cable, so the same unit works with a phone, tablet or billing computer.",
    features: [
      "200 times/sec scanning speed",
      "2000 mAh high-capacity battery",
      "1.5 m drop test",
      "Bluetooth and wired two-in-one",
    ],
    specs: [
      ["Type", "2D, Bluetooth + wired"],
      ["Battery", "2000 mAh"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ2870",
    name: "2D 2.4G Barcode Scanner with Base",
    tagline: "Wireless scanner that charges on its base",
    summary:
      "A 2D wireless scanner with a charging base, so it is always topped up and ready between orders.",
    features: [
      "200 times/sec scanning speed",
      "Charging base keeps it running without interruption",
      "1.5 m drop test",
      "2.4G / 433 / BLE can be customised",
    ],
    specs: [
      ["Type", "2D, 2.4G wireless, with charging base"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ9520",
    name: "2D Wired Desktop Barcode Scanner",
    tagline: "Large-window hands-free desktop scanner",
    summary:
      "A wired desktop scanner with a large scanning window. It reads 1D, 2D and on-screen barcodes, including codes shown on a phone.",
    features: [
      "200 times/sec scanning speed, large window",
      "Works with multiple language layouts, plug and play",
      "1.5 m drop test",
      "Scans 1D, 2D and screen barcodes",
    ],
    specs: [
      ["Type", "2D desktop, wired"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ9220",
    name: "2D Wired Desktop Barcode Scanner",
    tagline: "Desktop scanner for 1D, 2D and screen codes",
    summary:
      "A wired desktop scanner with a large window for counters where items are passed over the scanner rather than aimed at.",
    features: [
      "200 times/sec scanning speed, large window",
      "Works with multiple language layouts, plug and play",
      "1.5 m drop test",
      "Scans 1D, 2D and screen barcodes",
    ],
    specs: [
      ["Type", "2D desktop, wired"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ9320",
    name: "2D Wired Desktop Barcode Scanner",
    tagline: "Compact desktop scanner for busy counters",
    summary:
      "A wired desktop scanner in a compact body, reading 1D, 2D and on-screen barcodes through a large window.",
    features: [
      "200 times/sec scanning speed, large window",
      "Works with multiple language layouts, plug and play",
      "1.5 m drop test",
      "Scans 1D, 2D and screen barcodes",
    ],
    specs: [
      ["Type", "2D desktop, wired"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ3850",
    name: "2D Wired Barcode Scanner Module",
    tagline: "Small module to build into a kiosk or machine",
    summary:
      "A scanner module with a large window and a small footprint, made to be embedded into kiosks, counters and self-service machines.",
    features: [
      "200 times/sec scanning speed, large window",
      "Works with multiple language layouts, plug and play",
      "Small size, easy to embed",
      "Scans 1D, 2D and screen barcodes",
    ],
    specs: [["Type", "2D module, wired"]],
  }),
  scanner({
    model: "MJ2290",
    name: "2D Wired Barcode Scanner",
    tagline: "Handheld 2D scanner over USB",
    summary:
      "A wired handheld 2D scanner. Plug and play, and it reads 1D, 2D and on-screen barcodes.",
    features: [
      "200 times/sec scanning speed",
      "Works with multiple language layouts, plug and play",
      "1.5 m drop test",
      "Scans 1D, 2D and screen barcodes",
    ],
    specs: [
      ["Type", "2D handheld, wired"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ2850",
    name: "2D BLE + Wired Barcode Scanner",
    tagline: "Compact Bluetooth LE scanner that also works wired",
    summary:
      "A small 2D scanner that connects over Bluetooth LE or a cable, with a battery that lasts through a service.",
    features: [
      "200 times/sec scanning speed",
      "850 mAh high-capacity battery",
      "1.5 m drop test",
      "Bluetooth and wired two-in-one",
    ],
    specs: [
      ["Type", "2D, BLE + wired"],
      ["Battery", "850 mAh"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ3650",
    name: "2D 2.4G Wireless Barcode Scanner",
    tagline: "Cordless 2.4G scanner that also works wired",
    summary:
      "A 2D scanner with a 2.4G wireless receiver and a large battery. Use it cordless on the floor or plug it in.",
    features: [
      "200 times/sec scanning speed",
      "2000 mAh high-capacity battery",
      "1.5 m drop test",
      "2.4G and wired two-in-one",
    ],
    specs: [
      ["Type", "2D, 2.4G wireless + wired"],
      ["Battery", "2000 mAh"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ2816",
    name: "1D Wired CCD Barcode Scanner",
    tagline: "Wired CCD scanner for 1D codes",
    summary:
      "A wired CCD scanner for 1D barcodes. Plug and play, with manual and continuous scanning modes.",
    features: [
      "200 times/sec scanning speed",
      "Works with multiple language layouts, plug and play",
      "1.5 m drop test",
      "Can be switched to manual or continuous scanning",
    ],
    specs: [
      ["Type", "1D CCD, wired"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ2840",
    name: "1D 2.4G CCD Barcode Scanner",
    tagline: "Cordless 1D CCD scanner that also works wired",
    summary:
      "A 1D CCD scanner with a 2.4G wireless receiver and a large battery, for shops that only scan standard barcodes.",
    features: [
      "200 times/sec scanning speed",
      "2000 mAh high-capacity battery",
      "1.5 m drop test",
      "2.4G and wired two-in-one",
    ],
    specs: [
      ["Type", "1D CCD, 2.4G wireless + wired"],
      ["Battery", "2000 mAh"],
      ["Drop test", "1.5 m"],
    ],
  }),
  scanner({
    model: "MJ3670",
    name: "1.3 Million Pixel Industrial Handheld Scanner",
    tagline: "Wireless industrial scanner with a charging base",
    summary:
      "A rugged 2D wireless scanner with a base and a removable battery, built for warehouses, stock rooms and heavy daily use.",
    features: [
      "1280 × 1024 sensor",
      "2D wireless scanner with base",
      "2500 mAh battery, removable for long working days",
      "2.4G and Bluetooth",
    ],
    specs: [
      ["Sensor", "1280 × 1024"],
      ["Battery", "2500 mAh, removable"],
      ["Wireless", "2.4G + Bluetooth"],
    ],
  }),
  scanner({
    model: "MJ6600",
    name: "1.3 Million Pixel Industrial Handheld Scanner",
    tagline: "Industrial wireless scanner with a bigger battery",
    summary:
      "An industrial 2D wireless scanner with a base and a larger removable battery, for the longest shifts.",
    features: [
      "1280 × 1024 sensor",
      "2D wireless scanner with base",
      "3150 mAh battery, removable for long working days",
      "2.4G and Bluetooth",
    ],
    specs: [
      ["Sensor", "1280 × 1024"],
      ["Battery", "3150 mAh, removable"],
      ["Wireless", "2.4G + Bluetooth"],
    ],
  }),
  scanner({
    model: "MJ5200",
    name: "300,000 Pixel Industrial Handheld Barcode Reader",
    tagline: "Wired industrial 2D reader",
    summary:
      "A wired handheld 2D reader for industrial work such as PCB, new energy, electronics and auto parts.",
    features: [
      "640 × 480 sensor (global)",
      "2D handheld wired barcode scanner",
      "For PCB, new energy, 3C, electronic semiconductors, auto parts and similar",
    ],
    specs: [
      ["Sensor", "640 × 480"],
      ["Type", "2D handheld, wired"],
    ],
  }),
  scanner({
    model: "MJ3660",
    name: "300,000 Pixel Industrial Handheld Barcode Reader",
    tagline: "Wireless industrial 2D reader with a base",
    summary:
      "A wireless handheld 2D reader with a charging base and a removable battery, for industrial use.",
    features: [
      "640 × 480 sensor (global)",
      "2D wireless scanner with base",
      "2500 mAh battery, removable for long working days",
      "2.4G and Bluetooth",
    ],
    specs: [
      ["Sensor", "640 × 480"],
      ["Battery", "2500 mAh, removable"],
      ["Wireless", "2.4G + Bluetooth"],
    ],
  }),

  // ------------------------------------------
  // RECEIPT PRINTERS (80 mm)
  // ------------------------------------------
  {
    id: "sp-pos892ued",
    brand: "Gobbler",
    model: "SP-POS892UED",
    name: "80 mm USB + LAN Thermal Receipt Printer",
    category: "printers",
    tagline: "Fast bill and KOT printer for the counter",
    summary:
      "An 80 mm thermal receipt printer with USB and LAN, fast enough for a lunch rush. It drives a cash drawer directly and works with Android, Windows, iOS and Linux.",
    highlights: ["220 mm/sec", "USB + LAN", "Drives a cash drawer"],
    features: [
      "Prints at up to 220 mm/sec",
      "USB and LAN connections",
      "Cash drawer output built in",
      "Auto cutter rated for 1,500,000 cuts",
      "Works with Android, Windows, iOS and Linux",
    ],
    specs: [
      ["Printing speed", "220 mm/sec"],
      ["Interface", "USB + LAN"],
      ["Weight", "1.15 kg"],
      ["Dimensions", "179 × 152 × 118 mm"],
      ...PRINTER_COMMON,
    ],
    images: placeholder("SP-POS892UED"),
  },
  {
    id: "sp-pos893usd",
    brand: "Gobbler",
    model: "SP-POS893USD",
    name: "80 mm USB + LAN Thermal Receipt Printer",
    category: "printers",
    tagline: "Compact 80 mm printer with USB and LAN",
    summary:
      "A compact 80 mm thermal receipt printer with USB and LAN. Small enough for a crowded counter and quick enough for bills and kitchen tickets.",
    highlights: ["200 mm/sec", "USB + LAN", "1 kg, compact"],
    features: [
      "Prints at up to 200 mm/sec",
      "USB and LAN connections",
      "Cash drawer output built in",
      "Auto cutter rated for 1,500,000 cuts",
      "Works with Android, Windows, iOS and Linux",
    ],
    specs: [
      ["Printing speed", "200 mm/sec"],
      ["Interface", "USB + LAN"],
      ["Weight", "1 kg"],
      ["Dimensions", "165 × 120 × 119 mm"],
      ...PRINTER_COMMON,
    ],
    images: placeholder("SP-POS893USD"),
  },
  {
    id: "sp-pos894ued",
    brand: "Gobbler",
    model: "SP-POS894UED",
    name: "80 mm USB + Bluetooth Thermal Receipt Printer",
    category: "printers",
    tagline: "Print bills from a phone or tablet over Bluetooth",
    summary:
      "An 80 mm thermal receipt printer with USB and Bluetooth, so a tablet at the table can print straight to the counter without a cable.",
    highlights: ["200 mm/sec", "USB + Bluetooth", "1 kg, compact"],
    features: [
      "Prints at up to 200 mm/sec",
      "USB and Bluetooth connections",
      "Cash drawer output built in",
      "Auto cutter rated for 1,500,000 cuts",
      "Works with Android, Windows, iOS and Linux",
    ],
    specs: [
      ["Printing speed", "200 mm/sec"],
      ["Interface", "USB + Bluetooth"],
      ["Weight", "1 kg"],
      ["Dimensions", "165 × 120 × 119 mm"],
      ...PRINTER_COMMON,
    ],
    images: placeholder("SP-POS894UED"),
  },
  {
    id: "sp-pos892ubtmm",
    brand: "Gobbler",
    model: "SP POS892UBTMM",
    name: "80 mm Thermal Printer (USB + LAN + WiFi)",
    category: "printers",
    tagline: "Wireless and wired, with three ways to connect",
    summary:
      "An 80 mm thermal printer that connects by USB, LAN or WiFi. Place it wherever the kitchen or counter needs it, without running a cable back to the computer.",
    highlights: ["USB + LAN + WiFi", "200 mm/sec", "Drives a cash drawer"],
    features: [
      "Prints at up to 200 mm/sec",
      "USB, LAN and WiFi connections",
      "Cash drawer output built in",
      "Auto cutter rated for 1,500,000 cuts",
      "Works with Android, Windows, iOS and Linux",
    ],
    specs: [
      ["Printing speed", "200 mm/sec"],
      ["Interface", "USB + LAN + WiFi"],
      ["Weight", "1 kg"],
      ["Dimensions", "165 × 120 × 119 mm"],
      ...PRINTER_COMMON,
    ],
    images: placeholder("SP POS892UBTMM"),
  },
  {
    id: "pos891uebtdmwd-plus",
    brand: "SPRT",
    model: "POS891UEBTDMWd Plus",
    name: "Kitchen Printer",
    category: "printers",
    tagline: "Four connections and a colour status light",
    summary:
      "An 80 mm kitchen printer that connects by USB, LAN, WiFi or Bluetooth. A four-colour LED shows its status at a glance across a noisy kitchen.",
    highlights: ["USB + LAN + WiFi + Bluetooth", "200 mm/sec", "IP53"],
    features: [
      "USB, LAN, WiFi and Bluetooth connections",
      "Prints at up to 200 mm/sec",
      "4-colour LED status indicator",
      "IP53 splash protection for kitchen use",
    ],
    specs: [
      ["Interface", "USB + LAN + WiFi + Bluetooth"],
      ["Paper width", "80 mm"],
      ["Paper type", "Thermal paper"],
      ["Print speed", "Max 200 mm/sec"],
      ["Water and dust rating", "IP53"],
      ["Indicator", "4-colour LED"],
    ],
    images: placeholder("POS891UEBTDMWd Plus"),
  },

  // ------------------------------------------
  // MOBILE PRINTERS
  // ------------------------------------------
  {
    id: "hop-e-300",
    brand: "Gobbler",
    model: "HOP E-300",
    name: "80 mm USB + Bluetooth 3 Inch Mobile Printer",
    category: "mobile-printers",
    tagline: "Pocket printer for bills, labels and barcodes",
    summary:
      "A rechargeable 3 inch mobile printer for takeaway and delivery bills, labels and barcodes. It pairs with Android and iOS devices over Bluetooth.",
    highlights: ["Battery powered", "Barcode + receipt", "Android and iOS"],
    features: [
      "Prints receipts and barcode labels",
      "2500 mAh rechargeable battery",
      "Paper width from 20 mm to 80 mm",
      "Supports Android and iOS over Bluetooth",
      "Light at 364 g",
    ],
    specs: [
      ["Printing method", "Direct thermal"],
      ["Printing width", "80 mm"],
      ["Printing speed", "70 mm/sec"],
      ["Printing type", "Barcode + receipt"],
      ["Paper thickness", "0.06 mm – 0.08 mm"],
      ["Resolution", "203 dpi"],
      ["Interface", "USB + Bluetooth"],
      ["Battery", "2500 mAh lithium polymer"],
      ["Paper width", "20 – 80 mm"],
      ["Weight", "364 g"],
      ["Dimensions", "115 × 111 × 60 mm"],
      ["Connectivity", "Supports Android and iOS via Bluetooth"],
      ["Protection", "IP54"],
    ],
    images: placeholder("HOP E-300"),
  },
  {
    id: "hop-hl-58",
    brand: "Gobbler",
    model: "HOP HL-58",
    name: "58 mm USB + Bluetooth 2 Inch Mobile Printer",
    category: "mobile-printers",
    tagline: "Small, light bill printer for waiters and delivery",
    summary:
      "A 2 inch mobile printer that fits in a hand or a pocket. It prints bills over Bluetooth from an Android or iOS device and charges over USB.",
    highlights: ["58 mm paper", "200 g", "Android and iOS"],
    features: [
      "58 mm receipt paper",
      "1500 mAh rechargeable battery",
      "Supports Android and iOS over Bluetooth",
      "Light at 200 g",
    ],
    specs: [
      ["Printing method", "Thermal line"],
      ["Printing width", "48 mm"],
      ["Printing speed", "70 mm/sec"],
      ["Paper diameter", "72 mm"],
      ["Paper thickness", "0.06 mm – 0.08 mm"],
      ["Resolution", "203 dpi"],
      ["Interface", "USB + Bluetooth"],
      ["Battery", "1500 mAh lithium polymer"],
      ["Paper width", "57.5 ± 0.5 mm"],
      ["Weight", "200 g"],
      ["Dimensions", "110 × 78 × 47 mm"],
      ["Connectivity", "Supports Android and iOS via Bluetooth"],
      ["Protection", "IP54"],
    ],
    images: placeholder("HOP HL-58"),
  },

  // ------------------------------------------
  // CASH DRAWERS
  // ------------------------------------------
  drawer({
    model: "GS 405 A",
    color: "Black",
    size: "400 × 400 × 90 mm",
    tray: "5 notes / 8 coins",
    weight: "5 kg",
  }),
  drawer({
    model: "GS 405 B",
    color: "White",
    size: "400 × 400 × 90 mm",
    tray: "5 notes / 8 coins",
    weight: "5 kg",
  }),
  drawer({
    model: "GS 406 A",
    color: "Black",
    size: "410 × 420 × 100 mm",
    tray: "6 notes / 3 coins",
    weight: "5 kg",
  }),
  drawer({
    model: "GS 410 G",
    color: "Black",
    size: "415 × 415 × 100 mm",
    tray: "5 notes / 8 coins",
    weight: "6.5 kg",
  }),
  {
    id: "sp-335",
    brand: "SPRT",
    model: "SP-335",
    name: "Cash Drawer SP-335",
    category: "drawers",
    tagline: "Electromagnet drawer with a three-level lock",
    summary:
      "A cash drawer with a three-level lock and a steel top and bottom. It connects to a receipt printer over RJ11 or RJ12 and opens when a bill prints.",
    highlights: ["3-level lock", "RJ11 / RJ12", "6/9/12/24 V"],
    features: [
      "Three-level lock",
      "Works at 6, 9, 12 or 24 V",
      "Steel (SGCC) top and bottom plates",
      "Connects to the printer over RJ11 or RJ12",
    ],
    specs: [
      ["Electromagnet", "6 / 9 / 12 / 24 V"],
      ["Lock", "3 levels"],
      ["Interface", "RJ11 / RJ12"],
      ["Material", "Top and bottom plates are SGCC; the rest is plastic"],
    ],
    images: placeholder("SP-335"),
  },

  // ------------------------------------------
  // ALL-IN-ONE POS
  // ------------------------------------------
  {
    id: "rs609p",
    brand: "SPRT",
    model: "RS609P",
    name: "Dual-screen All-in-one POS",
    category: "pos",
    tagline: "15 inch billing screen plus a 14 inch customer display",
    summary:
      "A Windows POS terminal with a 15 inch billing screen and a 14 inch customer-facing display. Core i5, 8 GB of memory and a 512 GB SSD keep billing quick, and the port list covers printers, scanners and drawers.",
    highlights: [
      '15" + 14" dual screen',
      "Core i5, 8 GB, 512 GB SSD",
      "Windows 10 / 11",
    ],
    features: [
      "15 inch main screen and 14 inch customer display",
      "Windows 10 and 11",
      "Intel Core i5 (3rd generation)",
      "8 GB RAM and 512 GB SSD",
      "WiFi and a speaker built in",
      "Six USB, two serial, HDMI and LAN ports",
    ],
    specs: [
      ["Main board", "Industrial control mainboard"],
      ["Display", 'Dual screen, 15" + 14" customer display'],
      ["Operating system", "Windows 10 and 11"],
      ["CPU", "Intel Core i5, 3rd generation"],
      ["Resolution", "1024 × 768"],
      ["RAM", "8 GB"],
      ["Storage", "512 GB SSD"],
      ["WiFi", "Built in"],
      ["Speaker", "Built in"],
      ["Interfaces", "USB × 6, serial × 2, HDMI × 1, LAN × 1, audio"],
    ],
    images: placeholder("RS609P"),
  },
  posTerminal({ model: "MJ-T2", tagline: "Touch POS with a slim stand" }),
  posTerminal({
    model: "MJ-Q6",
    tagline: "Touch POS with a customer display option",
  }),
  posTerminal({
    model: "MJ-A9",
    tagline: "Windows touch POS on a tilting stand",
    extra: [["Operating system", "Windows"]],
  }),
  posTerminal({ model: "MJ-Q8", tagline: "White dual-screen touch POS" }),
  posTerminal({
    model: "MJ-G300",
    tagline: "Android touch POS",
    extra: [["Operating system", "Android"]],
  }),
  posTerminal({
    model: "MJ-T215",
    tagline: "Large Windows touch screen",
    extra: [["Operating system", "Windows"]],
  }),
];

// Real photos from products.images.js win; otherwise keep the sample image.
export const PRODUCTS = RAW_PRODUCTS.map((product) => {
  const photos = PRODUCT_IMAGES[product.id];
  return photos?.length ? { ...product, images: photos } : product;
});

// ==============================================
// WHATSAPP + CALL LINKS
// ==============================================
//
// The enquiry message names the product the visitor picked, so whoever
// answers the phone doesn't have to ask "which one?".

export const buildEnquiryMessage = (product) => {
  const lines = [
    `Hello ${PRODUCT_CONTACT.company}, I'd like to enquire about this product:`,
    "",
    `Product: ${product.name}`,
    `Model: ${product.model}`,
    `Brand: ${product.brand}`,
    `Category: ${categoryLabel(product.category)}`,
  ];

  if (product.highlights?.length) {
    lines.push(`Key details: ${product.highlights.join(", ")}`);
  }

  lines.push("", "Please share availability and details.");
  return lines.join("\n");
};

export const whatsappLink = (product) => {
  const text = product
    ? buildEnquiryMessage(product)
    : `Hello ${PRODUCT_CONTACT.company}, I'd like help choosing the right POS hardware.`;
  return `https://wa.me/${PRODUCT_CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
};

export const callLink = `tel:${PRODUCT_CONTACT.phoneTel}`;
