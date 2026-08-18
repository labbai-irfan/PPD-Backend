import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Product } from '../products/schemas/product.schema';
import { Category } from '../categories/schemas/category.schema';

// The controller class is module-internal; pull it off the module's metadata.
import { SitemapModule } from './sitemap.module';

const chain = (rows: unknown[]) => ({
  select: () => ({ lean: () => ({ exec: () => Promise.resolve(rows) }) }),
});

describe('sitemap.xml', () => {
  it('lists static routes, categories and every active product', async () => {
    const controllers = Reflect.getMetadata('controllers', SitemapModule) as [new (...a: never[]) => object];
    const moduleRef = await Test.createTestingModule({
      controllers,
      providers: [
        {
          provide: getModelToken(Product.name),
          useValue: { find: () => chain([{ slug: 'popular-cyber-world-5', updatedAt: new Date('2026-08-01') }]) },
        },
        {
          provide: getModelToken(Category.name),
          useValue: { find: () => chain([{ slug: 'ncert' }]) },
        },
      ],
    }).compile();

    const xml: string = await (moduleRef.get(controllers[0]) as { sitemap(): Promise<string> }).sitemap();

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<loc>https://popularbookworld.com</loc>');
    expect(xml).toContain('<loc>https://popularbookworld.com/products/PPD/popular-cyber-world-5</loc>');
    expect(xml).toContain('<lastmod>2026-08-01</lastmod>');
    expect(xml).toContain('/products/all?category=ncert');
    // the old static file's wrong domain must be gone for good
    expect(xml).not.toContain('popularpublishinghouse.com');
  });
});
