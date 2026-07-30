import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ProductsService } from './products.service';
import { Product, InventoryLog } from './schemas/product.schema';
import { Order } from '../orders/schemas/order.schema';
import { Wishlist } from '../wishlist/wishlist.module';
import { Category } from '../categories/schemas/category.schema';

/** The struck-through MRP must be the list price; the bold price must carry the discount. */
describe('selling price derives from MRP + discount', () => {
  let created: Record<string, any>;
  let service: ProductsService;

  beforeEach(async () => {
    created = {};
    const productModel = {
      create: (doc: Record<string, any>) => {
        created = doc;
        return Promise.resolve({ _id: 'x', ...doc });
      },
      findOne: () => ({ select: () => ({ exec: () => Promise.resolve(null) }) }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getModelToken(Product.name), useValue: productModel },
        { provide: getModelToken(InventoryLog.name), useValue: {} },
        { provide: getModelToken(Order.name), useValue: {} },
        { provide: getModelToken(Wishlist.name), useValue: {} },
        { provide: getModelToken(Category.name), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ProductsService);
  });

  it('applies the discount instead of saving the unit price verbatim', async () => {
    // The live regression: MRP 1999 at 25% off was stored as 1999.
    await service.adminCreate({
      title: 'Bharatvakya (Hard bond)',
      mrp: 1999,
      price: 1999,
      unitPrice: 1999,
      discountPercent: 25,
    } as any);

    expect(created.price).toBe(1499.25);
    expect(created.mrp).toBe(1999);
    expect(created.unitPrice).toBe(1999); // batch maths keeps the per-unit base
  });

  it('no discount means price equals MRP, so no strikethrough is shown', async () => {
    await service.adminCreate({ title: 'Cyber World-5', mrp: 399, price: 399 } as any);
    expect(created.price).toBe(399);
  });

  it('GST is added on top of the discounted price', async () => {
    await service.adminCreate({
      title: 'With GST',
      mrp: 1000,
      price: 1000,
      discountPercent: 10,
      gstPercent: 5,
    } as any);
    expect(created.price).toBe(945); // 1000 * 0.9 * 1.05
  });
});
