import { randomBytes, randomInt } from 'crypto';

/** "Premium A5 Notebook" -> "premium-a5-notebook" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Human-readable order number, e.g. ORD-48213 */
export function generateOrderNumber(): string {
  return `ORD-${randomInt(10000, 99999)}`;
}

/** Referral code, e.g. PPD-A1B2C3 */
export function generateReferralCode(): string {
  return `PPD-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Gift card code, e.g. GC-1A2B-3C4D */
export function generateGiftCardCode(): string {
  const part = () => randomBytes(2).toString('hex').toUpperCase();
  return `GC-${part()}-${part()}`;
}

/** Numeric OTP of the given length. */
export function generateOtp(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) code += randomInt(0, 10).toString();
  return code;
}
