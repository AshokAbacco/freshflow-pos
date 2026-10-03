const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const SCRIPT_TIMEOUT_MS = 15_000;

let loader = null;

/** Load Razorpay's hosted checkout once, on demand. */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);

  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
      const script = existing ?? document.createElement("script");
      const fail = (message) => {
        loader = null;
        script.remove();
        reject(new Error(message));
      };

      const timer = setTimeout(
        () =>
          fail(
            "The payment window is taking too long to load. Check your connection and try again.",
          ),
        SCRIPT_TIMEOUT_MS,
      );

      script.addEventListener("load", () => {
        clearTimeout(timer);
        if (window.Razorpay) resolve(window.Razorpay);
        else
          fail(
            "The payment window did not load correctly. Reload the page and try again.",
          );
      });
      script.addEventListener("error", () => {
        clearTimeout(timer);
        fail(
          "Could not load the payment window. Check your connection, or any ad blocker, and try again.",
        );
      });

      if (!existing) {
        script.src = SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
    });
  }
  return loader;
}

/**
 * A payment the customer completed but whose confirmation never reached our API — the tab was
 * closed, the network dropped, the phone died. Razorpay's webhook will activate the plan within
 * a few seconds, so the billing screen polls that order instead of telling them it failed.
 */
export class PaymentUnconfirmedError extends Error {
  constructor(orderId, cause) {
    super(
      "Your payment went through, but confirmation has not reached us yet.",
    );
    this.name = "PaymentUnconfirmedError";
    this.orderId = orderId;
    this.unconfirmed = true;
    this.cause = cause;
  }
}

/** The customer closed the checkout window without paying. */
export class CheckoutDismissedError extends Error {
  constructor() {
    super("Payment window closed before paying");
    this.name = "CheckoutDismissedError";
    this.dismissed = true;
  }
}

/**
 * Razorpay declined the payment: wrong OTP, insufficient funds, bank rejection.
 * No money left the customer's account, so this is safe to report as a failure straight away.
 */
export class PaymentDeclinedError extends Error {
  constructor(message, orderId) {
    super(message);
    this.name = "PaymentDeclinedError";
    this.declined = true;
    this.orderId = orderId;
  }
}

/**
 * Open Razorpay checkout for an order created by our API.
 * Resolves with the handover fields, which the API verifies against Razorpay before
 * changing any plan. Nothing here is trusted on its own.
 */
export async function openCheckout({ order, customer, description }) {
  const Razorpay = await loadRazorpay();

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const checkout = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: customer?.storeName || "FreshFlow POS",
      description,
      image: `${window.location.origin}/favicon.svg`,
      theme: { color: "#059669" },
      prefill: {
        name: customer?.name ?? "",
        email: customer?.email ?? "",
        contact: customer?.phone ?? "",
      },
      notes: { orderId: order.orderId },
      retry: { enabled: false },
      handler: (response) => settle(resolve, response),
      modal: {
        confirm_close: true,
        ondismiss: () => settle(reject, new CheckoutDismissedError()),
      },
    });

    checkout.on("payment.failed", (event) => {
      const reason =
        event?.error?.description || "The payment did not go through";
      const step = event?.error?.step;
      /*
       * `payment_authorization` is the step where the bank may have taken the money before
       * failing, so that one is treated as unconfirmed and waits for the webhook. Everything
       * else — a declined card, a wrong OTP, an abandoned UPI collect request — means no money
       * moved, and is reported as a failure right away.
       */
      if (step === "payment_authorization") {
        settle(
          reject,
          new PaymentUnconfirmedError(order.orderId, new Error(reason)),
        );
      } else {
        settle(reject, new PaymentDeclinedError(reason, order.orderId));
      }
    });

    checkout.open();
  });
}
