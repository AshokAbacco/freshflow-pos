const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loader = null;

/** Load Razorpay's hosted checkout once, on demand. */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve(window.Razorpay);
      script.onerror = () => {
        loader = null;
        reject(new Error('Could not load the payment window. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    });
  }
  return loader;
}

/**
 * Open Razorpay checkout for an order created by the API.
 * Resolves with the handover fields, which the API verifies before changing the plan.
 */
export async function openCheckout({ order, customer, description }) {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: customer?.storeName || 'FreshFlow POS',
      description,
      theme: { color: '#059669' },
      prefill: { name: customer?.name, email: customer?.email, contact: customer?.phone },
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => reject(Object.assign(new Error('Payment window closed before paying'), { dismissed: true })),
      },
    });
    checkout.on('payment.failed', (event) => {
      reject(new Error(event?.error?.description || 'The payment did not go through'));
    });
    checkout.open();
  });
}
