import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Product, ProductDocument, InventoryLog, ProductBatch } from './schemas/product.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { ProductQueryDto, SortOption } from './dto/product-query.dto';
import { CreateProductDto, UpdateProductDto, BatchDto } from './dto/admin-product.dto';
import { Paginated, paginate } from '../../common/dto/pagination-query.dto';
import { slugify } from '../../common/utils';

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LOW_STOCK_THRESHOLD = 10;

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(InventoryLog.name) private readonly inventoryLogModel: Model<InventoryLog>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
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

  private processBatches(batches: BatchDto[] | undefined, unitPrice: number): any[] | undefined {
    if (!batches) return undefined;

    const nameSet = new Set<string>();
    const qtySet = new Set<number>();
    const skuSet = new Set<string>();

    return batches.map((b) => {
      if (b.quantity <= 0) {
        throw new BadRequestException(`Batch quantity must be greater than 0 (got ${b.quantity} for ${b.name})`);
      }
      if (b.sellingPrice < 0) {
        throw new BadRequestException(`Selling price cannot be negative (got ${b.sellingPrice} for ${b.name})`);
      }
      if (nameSet.has(b.name.toLowerCase())) {
        throw new BadRequestException(`Duplicate batch name is not allowed: ${b.name}`);
      }
      if (qtySet.has(b.quantity)) {
        throw new BadRequestException(`Duplicate batch quantity is not allowed: ${b.quantity}`);
      }
      if (skuSet.has(b.sku.toLowerCase())) {
        throw new BadRequestException(`Duplicate batch SKU is not allowed: ${b.sku}`);
      }
      nameSet.add(b.name.toLowerCase());
      qtySet.add(b.quantity);
      skuSet.add(b.sku.toLowerCase());

      const calculatedPrice = unitPrice * b.quantity;
      let sellingPrice = b.sellingPrice;

      if (b.pricingMode === 'auto') {
        let discountAmount = 0;
        if (b.discountType === 'percentage' && b.discountValue) {
          discountAmount = (calculatedPrice * b.discountValue) / 100;
        } else if (b.discountType === 'fixed' && b.discountValue) {
          discountAmount = b.discountValue;
        }
        sellingPrice = Math.max(0, calculatedPrice - discountAmount);
      }

      return {
        _id: b.id && Types.ObjectId.isValid(b.id) ? new Types.ObjectId(b.id) : new Types.ObjectId(),
        sku: b.sku,
        name: b.name,
        quantity: b.quantity,
        calculatedPrice,
        discountType: b.discountType ?? 'none',
        discountValue: b.discountValue ?? 0,
        sellingPrice,
        pricingMode: b.pricingMode,
        displayOrder: b.displayOrder ?? 0,
        status: b.status ?? 'active',
        isDefault: b.isDefault ?? false,
        image: b.image,
        description: b.description,
        badge: b.badge ?? 'none',
        minOrderCount: b.minOrderCount ?? 1,
        maxOrderCount: b.maxOrderCount ?? 99,
      };
    });
  }

  async adminCreate(data: CreateProductDto): Promise<ProductDocument> {
    const slug = await this.uniqueSlug(slugify(data.title));
    const unitPrice = data.unitPrice !== undefined ? data.unitPrice : data.price;
    const stockQuantity = data.stockQuantity !== undefined ? data.stockQuantity : (data.stock ?? 0);

    if (unitPrice < 0) throw new BadRequestException('Unit price cannot be negative');
    if (stockQuantity < 0) throw new BadRequestException('Stock quantity cannot be negative');

    const processedBatches = this.processBatches(data.batches, unitPrice);

    const product = await this.productModel.create({
      ...data,
      slug,
      price: unitPrice,
      unitPrice,
      stock: stockQuantity,
      stockQuantity,
      batches: processedBatches || [],
    });

    if (stockQuantity > 0) {
      await this.inventoryLogModel.create({
        productId: product._id,
        changeAmount: stockQuantity,
        action: 'initial',
        reason: 'Initial stock on product creation',
        performedBy: 'admin',
      });
    }

    return product;
  }

  async adminUpdate(id: string, patch: UpdateProductDto): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();
    if (!product) throw new NotFoundException('Product not found');

    if (patch.title && patch.title !== product.title) {
      product.slug = await this.uniqueSlug(slugify(patch.title), id);
    }

    const oldUnitPrice = product.unitPrice ?? product.price;
    const oldStock = product.stockQuantity ?? product.stock;

    const unitPrice = patch.unitPrice !== undefined ? patch.unitPrice : (patch.price !== undefined ? patch.price : oldUnitPrice);
    const stockQuantity = patch.stockQuantity !== undefined ? patch.stockQuantity : (patch.stock !== undefined ? patch.stock : oldStock);

    if (unitPrice < 0) throw new BadRequestException('Unit price cannot be negative');
    if (stockQuantity < 0) throw new BadRequestException('Stock quantity cannot be negative');

    let processedBatches = patch.batches !== undefined ? this.processBatches(patch.batches, unitPrice) : undefined;
    if (processedBatches === undefined && unitPrice !== oldUnitPrice) {
      processedBatches = product.batches.map((b: any) => {
        const calculatedPrice = unitPrice * b.quantity;
        let sellingPrice = b.sellingPrice;
        if (b.pricingMode === 'auto') {
          let discountAmount = 0;
          if (b.discountType === 'percentage' && b.discountValue) {
            discountAmount = (calculatedPrice * b.discountValue) / 100;
          } else if (b.discountType === 'fixed' && b.discountValue) {
            discountAmount = b.discountValue;
          }
          sellingPrice = Math.max(0, calculatedPrice - discountAmount);
        }
        return {
          ...b.toObject ? b.toObject() : b,
          calculatedPrice,
          sellingPrice,
        };
      });
    }

    if (patch.batches !== undefined) {
      const newBatchIds = new Set(patch.batches.map(b => b.id).filter(Boolean));
      for (const oldBatch of product.batches) {
        const oldIdStr = (oldBatch as any)._id?.toString();
        if (oldIdStr && !newBatchIds.has(oldIdStr)) {
          const inOrders = await this.orderModel.findOne({ 'items.batchId': oldIdStr }).exec();
          if (inOrders) {
            throw new BadRequestException(
              `Cannot delete batch "${oldBatch.name}" because it was used in Order #${inOrders.orderNumber}. Set its status to "inactive" instead.`
            );
          }
        }
      }
    }

    const stockChange = stockQuantity - oldStock;
    if (stockChange !== 0) {
      await this.inventoryLogModel.create({
        productId: product._id,
        changeAmount: stockChange,
        action: 'adjustment',
        reason: patch.stockQuantity !== undefined ? 'Admin manual stock adjustment' : 'Admin manual restock',
        performedBy: 'admin',
      });
    }

    Object.assign(product, patch);
    
    product.price = unitPrice;
    product.unitPrice = unitPrice;
    product.stock = stockQuantity;
    product.stockQuantity = stockQuantity;
    if (processedBatches !== undefined) {
      product.batches = processedBatches as any;
    }

    return product.save();
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

  async getInventoryLogs(productId: string): Promise<InventoryLog[]> {
    if (!Types.ObjectId.isValid(productId)) {
      throw new BadRequestException('Invalid product ID');
    }
    return this.inventoryLogModel
      .find({ productId: new Types.ObjectId(productId) })
      .sort({ createdAt: -1 })
      .exec();
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
