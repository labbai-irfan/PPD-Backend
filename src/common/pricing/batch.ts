/**
 * Batch resolution shared by OrdersService.place() and PaymentsService.computeAmount().
 *
 * These two must agree on the price of every line: the order is rejected when the
 * amount already charged does not match the total it computes, which strands the
 * customer's money with no order to show for it. Keeping the rule in one place is
 * the only way that stays true.
 */

/** The subset of a product this module prices from. */
export interface PricedProduct {
  title: string;
  sku?: string;
  price: number;
  mrp: number;
  images?: string[];
  batches?: unknown[];
}

export interface ResolvedBatch {
  _id: string;
  sku: string;
  name: string;
  quantity: number;
  calculatedPrice: number;
  sellingPrice: number;
  status: string;
  minOrderCount: number;
  maxOrderCount: number;
  pricingMode: string;
  image?: string;
}

/** Sentinel the storefront sends for products that have no batches configured. */
export const DEFAULT_BATCH_ID = 'default';

/**
 * A product with no batches sells as a single unit at its own price — mirrors the
 * "Standard Unit" the product page adds to the cart. Most of the catalogue is this.
 */
export function standardUnit(product: PricedProduct): ResolvedBatch {
  return {
    _id: DEFAULT_BATCH_ID,
    sku: product.sku || '',
    name: 'Standard Unit',
    quantity: 1,
    calculatedPrice: product.mrp,
    sellingPrice: product.price,
    status: 'active',
    minOrderCount: 1,
    maxOrderCount: 99,
    pricingMode: 'auto',
    image: product.images?.[0] ?? '',
  };
}

/**
 * Picks the batch a line item refers to. An explicit id must exist; anything else
 * ('default', or nothing) falls back to the product's default batch, then its first
 * active batch, then the standard unit. Returns null only when a named batch is missing.
 */
export function resolveBatch(product: PricedProduct, batchId?: string): ResolvedBatch | null {
  const batches = (product.batches ?? []) as ResolvedBatch[];

  if (batchId && batchId !== DEFAULT_BATCH_ID) {
    return batches.find((b) => String((b as { _id: unknown })._id) === batchId) ?? null;
  }

  return (
    batches.find((b) => (b as unknown as { isDefault?: boolean }).isDefault && b.status === 'active') ??
    batches.find((b) => b.status === 'active') ??
    standardUnit(product)
  );
}
