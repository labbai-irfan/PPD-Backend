import { resolveBatch, standardUnit } from './batch';

const PLAIN = { title: 'Bharat Bhagya Nirmata', sku: 'BBN-1', price: 599, mrp: 599, images: ['a.jpg'] };

const BATCHED = {
  title: 'Bharatvakya',
  sku: 'BV-1',
  price: 832.5,
  mrp: 1110,
  batches: [
    { _id: 'b1', sku: 'BV-S', name: 'Soft Bond', quantity: 1, calculatedPrice: 1110, sellingPrice: 832.5, status: 'active', minOrderCount: 1, maxOrderCount: 99, pricingMode: 'auto' },
    { _id: 'b2', sku: 'BV-P', name: 'Pack of 5', quantity: 5, calculatedPrice: 5550, sellingPrice: 3999, status: 'active', isDefault: true, minOrderCount: 1, maxOrderCount: 9, pricingMode: 'custom' },
  ],
};

describe('batch resolution', () => {
  it('sells a batch-less product as one standard unit at its own price', () => {
    // 746 of 748 products have no batches — this is the common path, not an edge case.
    const batch = resolveBatch(PLAIN);
    expect(batch).toMatchObject({ name: 'Standard Unit', quantity: 1, sellingPrice: 599, calculatedPrice: 599 });
  });

  it("treats the storefront's 'default' sentinel as no batch", () => {
    expect(resolveBatch(PLAIN, 'default')).toEqual(standardUnit(PLAIN));
  });

  it('picks a named batch when one is asked for', () => {
    expect(resolveBatch(BATCHED, 'b1')?.name).toBe('Soft Bond');
  });

  it('prefers the default batch when none is named', () => {
    expect(resolveBatch(BATCHED, 'default')?.name).toBe('Pack of 5');
  });

  it('returns null for a batch that no longer exists', () => {
    expect(resolveBatch(BATCHED, 'gone')).toBeNull();
  });

  it('prices a batched product from the batch, not the product', () => {
    // If the charge used product.price (832.5) and the order used the batch (3999),
    // the order would be rejected after payment. Both call this.
    expect(resolveBatch(BATCHED, 'b2')?.sellingPrice).toBe(3999);
  });
});
