const INR_FORMAT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

export function parseMoneyInput(value: string): number | null {
  const cleaned = value.replace(/[₹,\s]/g, '');
  if (!/^\d+(?:\.\d{0,2})?$/.test(cleaned)) return null;
  const [rupees, fraction = ''] = cleaned.split('.');
  const minor = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function formatMoney(minor: number): string {
  return INR_FORMAT.format(minor / 100);
}

export function formatMoneyInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function roundRatio(amountMinor: number, numerator: number, denominator: number): number {
  if (![amountMinor, numerator, denominator].every(Number.isSafeInteger) || denominator <= 0) {
    throw new Error('Money calculations require safe integers and a positive denominator.');
  }
  const rounded = (BigInt(amountMinor) * BigInt(numerator) + BigInt(denominator) / 2n) / BigInt(denominator);
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new Error('The calculated amount is outside the supported currency range.');
  return result;
}
