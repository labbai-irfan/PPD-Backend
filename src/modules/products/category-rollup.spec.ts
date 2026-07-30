import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ProductsService } from './products.service';
import { Product, InventoryLog } from './schemas/product.schema';
import { Order } from '../orders/schemas/order.schema';
import { Wishlist } from '../wishlist/wishlist.module';
import { Category } from '../categories/schemas/category.schema';
import { CategoriesService } from '../categories/categories.service';

const PARENT_ID = new Types.ObjectId();

/** Minimal chainable query stub: model.find(...).select(...).lean().exec() -> result */
const chain = (result: unknown) => ({
  select: () => ({ lean: () => ({ exec: () => Promise.resolve(result) }) }),
});

describe('category filtering includes subcategories', () => {
  it('parent slug matches itself plus its children', async () => {
    const categoryModel = {
      findOne: () => chain({ _id: PARENT_ID }),
      find: () => chain([{ slug: 'drawing-colouring' }, { slug: 'lab-manual' }]),
    };
    let captured: Record<string, unknown> = {};
    const productModel = {
      aggregate: (pipeline: any[]) => {
        captured = pipeline[0].$match;
        return Promise.resolve([{ items: [], total: [] }]);
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getModelToken(Product.name), useValue: productModel },
        { provide: getModelToken(InventoryLog.name), useValue: {} },
        { provide: getModelToken(Order.name), useValue: {} },
        { provide: getModelToken(Wishlist.name), useValue: {} },
        { provide: getModelToken(Category.name), useValue: categoryModel },
      ],
    }).compile();

    await moduleRef.get(ProductsService).list({
      category: 'popular-publications',
      sort: 'relevance',
      page: 1,
      pageSize: 15,
    } as any);

    expect(captured.category).toEqual({
      $in: ['popular-publications', 'drawing-colouring', 'lab-manual'],
    });
  });

  it('leaf slug (no children) stays an exact match', async () => {
    const categoryModel = {
      findOne: () => chain({ _id: PARENT_ID }),
      find: () => chain([]),
    };
    let captured: Record<string, unknown> = {};
    const productModel = {
      aggregate: (pipeline: any[]) => {
        captured = pipeline[0].$match;
        return Promise.resolve([{ items: [], total: [] }]);
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getModelToken(Product.name), useValue: productModel },
        { provide: getModelToken(InventoryLog.name), useValue: {} },
        { provide: getModelToken(Order.name), useValue: {} },
        { provide: getModelToken(Wishlist.name), useValue: {} },
        { provide: getModelToken(Category.name), useValue: categoryModel },
      ],
    }).compile();

    await moduleRef.get(ProductsService).list({
      category: 'lab-manual',
      sort: 'relevance',
      page: 1,
      pageSize: 15,
    } as any);

    expect(captured.category).toBe('lab-manual');
  });

  it('parent productCount sums its subcategories', async () => {
    const CHILD_ID = new Types.ObjectId();
    const docs = [
      { _id: PARENT_ID, slug: 'popular-publications', parentId: null },
      { _id: CHILD_ID, slug: 'lab-manual', parentId: PARENT_ID },
    ].map((d) => ({ ...d, toObject: () => d }));

    const categoryModel = {
      find: () => ({ sort: () => ({ exec: () => Promise.resolve(docs) }) }),
    };
    const productModel = {
      aggregate: () => Promise.resolve([{ _id: 'lab-manual', count: 4 }]),
      countDocuments: () => Promise.resolve(4),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getModelToken(Category.name), useValue: categoryModel },
        { provide: getModelToken(Product.name), useValue: productModel },
      ],
    }).compile();

    const result = await moduleRef.get(CategoriesService).list();
    expect(result.find((c) => c.slug === 'popular-publications')?.productCount).toBe(4);
    expect(result.find((c) => c.slug === 'lab-manual')?.productCount).toBe(4);
  });
});
