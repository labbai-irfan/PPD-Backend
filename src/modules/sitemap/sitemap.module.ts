import { Controller, Get, Header, Module } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Public } from '../../common/decorators/public.decorator';
import { Product, ProductSchema, ProductDocument } from '../products/schemas/product.schema';
import { Category, CategorySchema, CategoryDocument } from '../categories/schemas/category.schema';

const SITE_URL = (process.env.SITE_URL ?? 'https://popularbookworld.com').replace(/\/$/, '');

/** Storefront routes worth indexing that aren't data-driven. */
const STATIC_PATHS = ['', '/products', '/products/all', '/packages', '/about', '/help', '/terms', '/privacy'];

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/**
 * Live sitemap — every active product and category, always current.
 * The static public/sitemap.xml this replaces had 15 hand-written URLs and none
 * of the catalogue. robots.txt points crawlers here (/api/sitemap.xml).
 */
@Public()
@ApiExcludeController()
@Controller('sitemap.xml')
class SitemapController {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  @Get()
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async sitemap(): Promise<string> {
    // timestamps: true adds updatedAt at runtime; the schema classes don't declare it
    type SlugRow = { slug: string; updatedAt?: Date };
    const [products, categories] = (await Promise.all([
      this.productModel.find({ isActive: true }).select('slug updatedAt').lean().exec(),
      this.categoryModel.find({ isActive: true, slug: { $ne: 'all' } }).select('slug updatedAt').lean().exec(),
    ])) as [SlugRow[], SlugRow[]];

    const url = (path: string, lastmod?: Date) =>
      `  <url><loc>${SITE_URL}${escapeXml(path)}</loc>${
        lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ''
      }</url>`;

    const entries = [
      ...STATIC_PATHS.map((p) => url(p)),
      ...categories.map((c) => url(`/products/all?category=${c.slug}`, c.updatedAt)),
      ...products.map((p) => url(`/products/PPD/${p.slug}`, p.updatedAt)),
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
  ],
  controllers: [SitemapController],
})
export class SitemapModule {}
