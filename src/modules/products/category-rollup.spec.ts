import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ProductsService } from './products.service';
import { Product, InventoryLog } from './schemas/product.schema';
import { Order } from '../orders/schemas/order.schema';
import { Wishlist } from '../wishlist/wishlist.module';
import { Category } from '../categories/schemas/category.schema';
import { CategoriesService } from '../categories/categories.service';

/** Minimal chainable query stub: model.find(...).select(...).lean().exec() -> result */
const chain = (result: unknown) => ({
  select: () => ({ lean: () => ({ exec: () => Promise.resolve(result) }) }),
});

/**
 * Category model stub. `tree` maps a parent slug to its subcategory slugs; a slug
 * stands in for its own _id so the parent -> children lookup stays readable.
 */
const categoryModelFor = (tree: Record<string, string[]>) => ({
  find: (q: any) => {
    if (q.slug) return chain(q.slug.$in.map((slug: string) => ({ _id: slug })));
    const parents: string[] = q.parentId.$in;
    return chain(parents.flatMap((p) => (tree[p] ?? []).map((slug) => ({ slug }))));
  },
});

/** Runs list() and returns the $match the aggregation was built with. */
async function matchFor(category: string, tree: Record<string, string[]>) {
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
      { provide: getModelToken(Category.name), useValue: categoryModelFor(tree) },
    ],
  }).compile();

  await moduleRef
    .get(ProductsService)
    .list({ category, sort: 'relevance', page: 1, pageSize: 15 } as any);
  return captured;
}

const TREE = {
  'popular-publications': ['drawing-colouring', 'lab-manual'],
  ncert: ['class-11', 'class-12'],
  'lab-manual': [],
};

describe('category filtering', () => {
  it('a parent slug matches itself plus its children', async () => {
    const match = await matchFor('popular-publications', TREE);
    expect(match.category).toEqual({
      $in: ['popular-publications', 'drawing-colouring', 'lab-manual'],
    });
  });

  it('a leaf slug stays an exact match', async () => {
    const match = await matchFor('lab-manual', TREE);
    expect(match.category).toBe('lab-manual');
  });

  it('multi-select expands every selected slug', async () => {
    const match = await matchFor('ncert,popular-publications', TREE);
    expect(match.category).toEqual({
      $in: [
        'ncert',
        'popular-publications',
        'class-11',
        'class-12',
        'drawing-colouring',
        'lab-manual',
      ],
    });
  });

  it('a parent selected alongside its own child does not duplicate slugs', async () => {
    const match = await matchFor('ncert,class-11', TREE);
    expect(match.category).toEqual({ $in: ['ncert', 'class-11', 'class-12'] });
  });

  it('"all" is not a filter', async () => {
    const match = await matchFor('all', TREE);
    expect(match.category).toBeUndefined();
  });
});

describe('category product counts', () => {
  it('a parent sums its subcategories', async () => {
    const PARENT_ID = new Types.ObjectId();
    const CHILD_ID = new Types.ObjectId();
    const docs = [
      { _id: PARENT_ID, slug: 'ncert', parentId: null },
      { _id: CHILD_ID, slug: 'class-12', parentId: PARENT_ID },
    ].map((d) => ({ ...d, toObject: () => d }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getModelToken(Category.name),
          useValue: { find: () => ({ sort: () => ({ exec: () => Promise.resolve(docs) }) }) },
        },
        {
          provide: getModelToken(Product.name),
          useValue: {
            aggregate: () => Promise.resolve([{ _id: 'class-12', count: 7 }]),
            countDocuments: () => Promise.resolve(7),
          },
        },
      ],
    }).compile();

    const result = await moduleRef.get(CategoriesService).list();
    expect(result.find((c) => c.slug === 'ncert')?.productCount).toBe(7);
    expect(result.find((c) => c.slug === 'class-12')?.productCount).toBe(7);
  });
});
