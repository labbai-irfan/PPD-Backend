import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';
import { ProductQueryDto, SortOption } from './dto/product-query.dto';
import { CreateProductDto, UpdateProductDto } from './dto/admin-product.dto';
import { Paginated, paginate } from '../../common/dto/pagination-query.dto';
import { slugify } from '../../common/utils';

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LOW_STOCK_THRESHOLD = 10;

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  async list(query: ProductQueryDto): Promise<Paginated<unknown>> {
    // Plain record: feeds an aggregation $match, which mongoose does not type-check
    const match: Record<string, unknown> = { isActive: true };

    if (query.category && query.category !== 'all') match.category = query.category;
    if (query.tag === 'new') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      match.createdAt = { $gte: sevenDaysAgo };
    } else if (query.tag) {
      match.tags = query.tag;
    }
    if (query.ppdOriginal) match.isPpdOriginal = true;
    if (query.brands?.length) match.brand = { $in: query.brands };
    if (query.minRating !== undefined) match.rating = { $gte: query.minRating };
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      match.price = {
        ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
      };
    }
    if (query.q) {
      // Regex over text index: supports partial words for typeahead on a small catalog
      const rx = new RegExp(escapeRegex(query.q), 'i');
      match.$or = [{ title: rx }, { brand: rx }, { description: rx }];
    }

    const pipeline: PipelineStage[] = [{ $match: match }];

    if (query.sort === 'discount') {
      pipeline.push({
        $addFields: {
          discountPct: {
            $cond: [
              { $gt: ['$mrp', 0] },
              { $divide: [{ $subtract: ['$mrp', '$price'] }, '$mrp'] },
              0,
            ],
          },
        },
      });
    }

    pipeline.push(
      { $sort: this.sortSpec(query.sort) },
      {
        $facet: {
          items: [
            { $skip: (query.page - 1) * query.pageSize },
            { $limit: query.pageSize },
            { $project: { discountPct: 0 } },
          ],
          total: [{ $count: 'count' }],
        },
      },
    );

    const [result] = await this.productModel.aggregate<{
      items: unknown[];
      total: [{ count: number }?];
    }>(pipeline);

    const total = result?.total?.[0]?.count ?? 0;
    return paginate(result?.items ?? [], total, query.page, query.pageSize);
  }

  private sortSpec(sort: SortOption): Record<string, 1 | -1> {
    switch (sort) {
      case 'price-asc':
        return { price: 1 };
      case 'price-desc':
        return { price: -1 };
      case 'rating':
        return { rating: -1, ratingCount: -1 };
      case 'discount':
        return { discountPct: -1 };
      case 'newest':
      case 'relevance':
      default:
        return { createdAt: -1, _id: -1 };
    }
  }

  async getByIdOrSlug(idOrSlug: string): Promise<ProductDocument> {
    let product: ProductDocument | null = null;
    if (Types.ObjectId.isValid(idOrSlug)) {
      product = await this.productModel.findOne({ _id: idOrSlug, isActive: true }).exec();
    }
    if (!product) {
      product = await this.productModel.findOne({ slug: idOrSlug, isActive: true }).exec();
    }
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async getRelated(idOrSlug: string, limit = 8): Promise<ProductDocument[]> {
    const product = await this.getByIdOrSlug(idOrSlug);
    return this.productModel
      .find({ category: product.category, isActive: true, _id: { $ne: product._id } })
      .sort({ rating: -1, ratingCount: -1 })
      .limit(Math.min(limit, 20))
      .exec();
  }

  async getByIds(ids: string[]): Promise<ProductDocument[]> {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id));
    const slugs = ids.filter((id) => !Types.ObjectId.isValid(id));
    const products = await this.productModel
      .find({
        isActive: true,
        $or: [{ _id: { $in: valid } }, { slug: { $in: slugs } }],
      })
      .exec();

    // Preserve the caller's order (wishlist/compare rely on it)
    const byKey = new Map<string, ProductDocument>();
    for (const p of products) {
      byKey.set(p._id.toHexString(), p);
      byKey.set(p.slug, p);
    }
    return ids.map((id) => byKey.get(id)).filter((p): p is ProductDocument => !!p);
  }

  // ---------- Admin ----------

  async adminList(query: {
    q?: string;
    status?: 'active' | 'inactive';
    category?: string;
    stockStatus?: 'in-stock' | 'low' | 'out';
    sort?: 'newest' | 'name-asc' | 'stock-asc' | 'stock-desc';
    page: number;
    pageSize: number;
  }): Promise<Paginated<ProductDocument>> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.isActive = query.status === 'active';
    if (query.category && query.category !== 'all') filter.category = query.category;
    if (query.q) {
      const rx = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [{ title: rx }, { brand: rx }];
    }
    if (query.stockStatus === 'out') filter.stock = 0;
    else if (query.stockStatus === 'low') filter.stock = { $gt: 0, $lt: LOW_STOCK_THRESHOLD };
    else if (query.stockStatus === 'in-stock') filter.stock = { $gte: LOW_STOCK_THRESHOLD };

    const sortSpec: Record<string, 1 | -1> =
      query.sort === 'name-asc'
        ? { title: 1 }
        : query.sort === 'stock-asc'
          ? { stock: 1 }
          : query.sort === 'stock-desc'
            ? { stock: -1 }
            : { createdAt: -1 };

    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort(sortSpec)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.productModel.countDocuments(filter),
    ]);
    return paginate(items, total, query.page, query.pageSize);
  }

  /** Snapshot for the admin Inventory page's stat cards. */
  async inventoryStats() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [total, addedThisMonth] = await Promise.all([
      this.productModel.countDocuments(),
      this.productModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
    ]);
    return { total, addedThisMonth };
  }

  async adminCreate(data: CreateProductDto): Promise<ProductDocument> {
    const slug = await this.uniqueSlug(slugify(data.title));
    const stock = data.batches?.length ? this.sumBatchQuantity(data.batches) : (data.stock ?? 0);
    return this.productModel.create({ ...data, slug, stock });
  }

  async adminUpdate(id: string, patch: UpdateProductDto): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();
    if (!product) throw new NotFoundException('Product not found');

    // Re-slug only when the title changes
    if (patch.title && patch.title !== product.title) {
      product.slug = await this.uniqueSlug(slugify(patch.title), id);
    }
    Object.assign(product, patch);
    // Batches are the source of truth for stock whenever they're supplied on this update.
    if (patch.batches?.length) product.stock = this.sumBatchQuantity(patch.batches);
    return product.save();
  }

  private sumBatchQuantity(batches: { quantity: number }[]): number {
    return batches.reduce((sum, b) => sum + b.quantity, 0);
  }

  async adminToggle(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();
    if (!product) throw new NotFoundException('Product not found');
    product.isActive = !product.isActive;
    return product.save();
  }

  async adminDelete(id: string): Promise<void> {
    const result = await this.productModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) throw new NotFoundException('Product not found');
  }

  private async uniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
    let slug = baseSlug || 'product';
    for (let i = 2; ; i++) {
      const clash = await this.productModel
        .findOne({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
        .select('_id')
        .exec();
      if (!clash) return slug;
      slug = `${baseSlug}-${i}`;
    }
  }
}
