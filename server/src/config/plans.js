/**
 * Subscription catalogue. Prices are per user, per month, in INR.
 * `listPrice` is the published rate and `price` is what is actually charged today;
 * the difference is shown to the customer as the launch discount.
 *
 * Yearly plans are charged for 12 months up front at the lower monthly rate.
 */
export const TRIAL_DAYS = 30;
export const TRIAL_SEATS = 3;
export const MIN_SEATS = 1;
export const MAX_SEATS = 500;

export const PLANS = Object.freeze({
  STANDARD: {
    tier: 'STANDARD',
    name: 'Standard',
    blurb: 'Everything a single store needs to sell and stay on top of stock.',
    features: [
      'Unlimited bills and products',
      'Offline selling with automatic sync',
      'Barcode scanning and weighing scale',
      'Daily business report and analytics',
      'Inventory and stock ledger',
      'UPI, cash and card payments',
      'Email support',
    ],
    intervals: {
      MONTHLY: { listPrice: 850, price: 650 },
      YEARLY: { listPrice: 650, price: 550 },
    },
  },
  CUSTOM: {
    tier: 'CUSTOM',
    name: 'Custom',
    blurb: 'For chains and larger teams that need tailoring and priority help.',
    features: [
      'Everything in Standard',
      'Custom categories, fields and receipt layout',
      'Multiple registers and higher seat counts',
      'Priority onboarding and data migration',
      'Custom reports on request',
      'Priority support',
    ],
    intervals: {
      MONTHLY: { listPrice: 1300, price: 1000 },
      YEARLY: { listPrice: 1000, price: 800 },
    },
  },
});

export const isValidPlan = (tier, interval) => Boolean(PLANS[tier]?.intervals?.[interval]);

/** Months charged up front for an interval. */
export const monthsFor = (interval) => (interval === 'YEARLY' ? 12 : 1);

/**
 * What a subscription costs right now.
 * @returns {{pricePerUser:number, listPricePerUser:number, months:number, seats:number, total:number, listTotal:number, savings:number}}
 */
export function quote({ plan, interval, seats }) {
  if (!isValidPlan(plan, interval)) throw new Error(`Unknown plan ${plan}/${interval}`);
  const seatCount = Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.floor(Number(seats) || 0)));
  const { price, listPrice } = PLANS[plan].intervals[interval];
  const months = monthsFor(interval);
  return {
    plan,
    interval,
    seats: seatCount,
    months,
    pricePerUser: price,
    listPricePerUser: listPrice,
    total: price * seatCount * months,
    listTotal: listPrice * seatCount * months,
    savings: (listPrice - price) * seatCount * months,
  };
}

/** Plain catalogue for the public pricing page. */
export const publicPlans = () => ({
  trial: { days: TRIAL_DAYS, seats: TRIAL_SEATS },
  currency: 'INR',
  plans: Object.values(PLANS).map((p) => ({
    tier: p.tier,
    name: p.name,
    blurb: p.blurb,
    features: p.features,
    intervals: p.intervals,
  })),
});
