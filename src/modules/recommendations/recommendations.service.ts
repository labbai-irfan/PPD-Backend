import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
  ) {}

  /**
   * Validate and clean product data
   */
  private isValidProduct(product: ProductDocument): boolean {
    // Must have required fields
    if (!product?._id || !product?.title || !product?.category) return false;

    // Must be active
    if (!product.isActive) return false;

    // Must have stock
    if (!product.stock || product.stock <= 0) return false;

    // Price must be valid
    if (product.price == null || product.price < 0) return false;
    if (product.mrp == null || product.mrp < 0) return false;

    // Must have at least 1 image
    if (!product.images || product.images.length === 0) return false;

    return true;
  }

  /**
   * Get trending products based on sales quantity.
   * Used when user has no purchase history.
   * Filters for data quality and removes duplicates.
   */
  async getTrendingRecommendations(limit: number = 10): Promise<ProductDocument[]> {
    const maxLimit = Math.min(limit, 50);

    const products = await this.productModel
      .find({
        isActive: true,
        stock: { $gt: 0 },
        price: { $gt: 0 },
        images: { $exists: true, $ne: [] },
      })
      .sort({
        salesCount: -1,
        ratingCount: -1,
        rating: -1,
        createdAt: -1,
      })
      .limit(maxLimit * 2) // Fetch extra to account for filtering
      .exec();

    // Filter for data quality
    const validProducts = products.filter((p) => this.isValidProduct(p));

    // Remove duplicates by ID
    const seen = new Set<string>();
    const deduplicated = validProducts.filter((p) => {
      const id = p._id.toHexString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const result = deduplicated.slice(0, maxLimit);

    this.logger.debug(
      `Trending: fetched ${products.length}, valid ${validProducts.length}, returned ${result.length}`,
    );

    return result;
  }

  /**
   * Get personalized recommendations based on user's purchase history.
   * Strategy:
   * 1. Get categories user has purchased from
   * 2. Get top products from those categories
   * 3. Exclude products user has already purchased
   * 4. Supplement with trending if insufficient results
   */
  async getPersonalizedRecommendations(
    userId: string,
    limit: number = 10,
  ): Promise<ProductDocument[]> {
    // Validate ObjectId
    if (!Types.ObjectId.isValid(userId)) {
      return this.getTrendingRecommendations(limit);
    }

    const objectId = new Types.ObjectId(userId);
    const maxLimit = Math.min(limit, 50);

    // Get all delivered orders for this user
    const orders = await this.orderModel
      .find({
        userId: objectId,
        status: 'delivered',
      })
      .select('items')
      .exec();

    // If user has no purchase history, return trending products
    if (!orders || orders.length === 0) {
      this.logger.debug(`No orders found for user ${userId}, returning trending`);
      return this.getTrendingRecommendations(maxLimit);
    }

    // Extract categories and product IDs from user's purchases
    const categories = new Set<string>();
    const purchasedProductIds = new Set<string>();

    for (const order of orders) {
      if (!order.items || order.items.length === 0) continue;
      for (const item of order.items) {
        if (item?.productId) {
          purchasedProductIds.add(item.productId.toHexString());
        }
      }
    }

    // If no valid items in orders, fall back to trending
    if (purchasedProductIds.size === 0) {
      this.logger.debug(`No valid items found in orders for user ${userId}`);
      return this.getTrendingRecommendations(maxLimit);
    }

    // Get products from orders to extract their categories
    const purchasedProducts = await this.productModel
      .find({
        _id: { $in: Array.from(purchasedProductIds) },
        category: { $exists: true, $ne: '' },
      })
      .select('category')
      .exec();

    for (const product of purchasedProducts) {
      if (product?.category) {
        categories.add(product.category);
      }
    }

    // If we couldn't find categories, fall back to trending
    if (categories.size === 0) {
      this.logger.debug(`No categories found for user ${userId}, returning trending`);
      return this.getTrendingRecommendations(maxLimit);
    }

    // Get top products from user's favorite categories, excluding already purchased items
    const recommendations = await this.productModel
      .find({
        isActive: true,
        stock: { $gt: 0 },
        price: { $gt: 0 },
        images: { $exists: true, $ne: [] },
        category: { $in: Array.from(categories) },
        _id: { $nin: Array.from(purchasedProductIds) },
      })
      .sort({
        rating: -1,
        ratingCount: -1,
        salesCount: -1,
        createdAt: -1,
      })
      .limit(maxLimit * 2) // Fetch extra to account for filtering
      .exec();

    // Filter for data quality
    const validRecommendations = recommendations.filter((p) => this.isValidProduct(p));

    // Remove duplicates
    const seen = new Set<string>();
    const deduplicated = validRecommendations.filter((p) => {
      const id = p._id.toHexString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const finalRecommendations = deduplicated.slice(0, maxLimit);

    // If not enough recommendations from favorite categories, supplement with trending
    if (finalRecommendations.length < maxLimit) {
      const remaining = maxLimit - finalRecommendations.length;
      const usedIds = new Set<string>([
        ...Array.from(purchasedProductIds),
        ...finalRecommendations.map((p) => p._id.toHexString()),
      ]);

      const supplemental = await this.productModel
        .find({
          isActive: true,
          stock: { $gt: 0 },
          price: { $gt: 0 },
          images: { $exists: true, $ne: [] },
          _id: { $nin: Array.from(usedIds) },
        })
        .sort({ salesCount: -1, ratingCount: -1, rating: -1 })
        .limit(remaining * 2)
        .exec();

      const validSupplemental = supplemental.filter((p) => this.isValidProduct(p));
      const cleanedSupplemental = validSupplemental.slice(0, remaining);

      this.logger.debug(
        `Personalized for ${userId}: found ${finalRecommendations.length}, supplemented with ${cleanedSupplemental.length}`,
      );

      return [...finalRecommendations, ...cleanedSupplemental];
    }

    this.logger.debug(`Personalized for ${userId}: returned ${finalRecommendations.length}`);
    return finalRecommendations;
  }

  /**
   * Check if user has any purchase history
   */
  async hasUserPurchaseHistory(userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId)) {
      return false;
    }

    const orderCount = await this.orderModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: 'delivered',
    });

    return orderCount > 0;
  }

  /**
   * Get user's favorite categories based on purchase history
   */
  async getUserFavoriteCategories(userId: string, limit: number = 5): Promise<string[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }

    const objectId = new Types.ObjectId(userId);

    // Aggregate categories from user's delivered orders
    const result = await this.orderModel.aggregate([
      { $match: { userId: objectId, status: 'delivered' } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $group: { _id: '$product.category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { _id: 1 } },
    ]);

    return result.map((doc) => doc._id);
  }

  /**
   * Get recommendations by category with data quality filtering
   */
  async getRecommendationsByCategory(
    categorySlug: string,
    excludeProductId?: string,
    limit: number = 10,
  ): Promise<ProductDocument[]> {
    const maxLimit = Math.min(limit, 50);

    if (!categorySlug || categorySlug.trim() === '') {
      return this.getTrendingRecommendations(maxLimit);
    }

    const query: Record<string, any> = {
      isActive: true,
      stock: { $gt: 0 },
      price: { $gt: 0 },
      images: { $exists: true, $ne: [] },
      category: categorySlug.toLowerCase().trim(),
    };

    if (excludeProductId && Types.ObjectId.isValid(excludeProductId)) {
      query._id = { $ne: new Types.ObjectId(excludeProductId) };
    }

    const products = await this.productModel
      .find(query)
      .sort({
        rating: -1,
        ratingCount: -1,
        salesCount: -1,
        createdAt: -1,
      })
      .limit(maxLimit * 2)
      .exec();

    // Filter for quality
    const validProducts = products.filter((p) => this.isValidProduct(p));

    // Remove duplicates
    const seen = new Set<string>();
    const deduplicated = validProducts.filter((p) => {
      const id = p._id.toHexString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const result = deduplicated.slice(0, maxLimit);

    if (result.length < maxLimit) {
      this.logger.warn(
        `Category ${categorySlug}: only found ${result.length}/${maxLimit} valid products`,
      );
    }

    return result;
  }

  /**
   * Get product recommendation metadata (used for analytics/insights)
   */
  async getRecommendationStats(userId?: string): Promise<{
    hasPurchaseHistory: boolean;
    favoriteCategories: string[];
    totalOrdersCount: number;
  }> {
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return {
        hasPurchaseHistory: false,
        favoriteCategories: [],
        totalOrdersCount: 0,
      };
    }

    const objectId = new Types.ObjectId(userId);
    const totalOrdersCount = await this.orderModel.countDocuments({
      userId: objectId,
      status: 'delivered',
    });

    const hasPurchaseHistory = totalOrdersCount > 0;
    const favoriteCategories = hasPurchaseHistory
      ? await this.getUserFavoriteCategories(userId, 5)
      : [];

    return {
      hasPurchaseHistory,
      favoriteCategories,
      totalOrdersCount,
    };
  }
}
