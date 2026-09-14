/** Build a UPI deep link (NPCI "upi://pay" spec) that any UPI app can scan. */
export function buildUpiUri({ vpa, payeeName, amount, reference, note }) {
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName || 'Store',
    am: Number(amount).toFixed(2),
    cu: 'INR',
  });
  if (note) params.set('tn', note.slice(0, 50));
  if (reference) params.set('tr', reference.slice(0, 35));
  // URLSearchParams encodes spaces as "+", which some UPI apps show literally.
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}
