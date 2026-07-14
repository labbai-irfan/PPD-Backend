import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument, ReviewStatus } from './schemas/review.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Paginated, paginate } from '../../common/dto/pagination-query.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  /** Public: approved reviews for a product. */
  async listForProduct(productId: string, page = 1, pageSize = 12): Promise<Paginated<ReviewDocument>> {
    const filter = { productId: new Types.ObjectId(productId), status: 'approved' as const };
    const [items, total] = await Promise.all([
      this.reviewModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).exec(),
      this.reviewModel.countDocuments(filter),
    ]);
    return paginate(items, total, page, pageSize);
  }

  /** Customer: create (or resubmit) a review — enters moderation as pending. */
  async createOrUpdate(
    userId: string,
    userName: string,
    dto: { productId: string; rating: number; title: string; body: string },
    verifiedPurchase: boolean,
  ): Promise<ReviewDocument> {
    const product = await this.productModel.findById(dto.productId).select('title').exec();
    if (!product) throw new NotFoundException('Product not found');

    const uid = new Types.ObjectId(userId);
    const existing = await this.reviewModel.findOne({ userId: uid, productId: product._id }).exec();

    if (existing) {
      Object.assign(existing, {
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
        status: 'pending',
        verifiedPurchase,
      });
      await existing.save();
      await this.recomputeProductRating(product._id);
      return existing;
    }

    return this.reviewModel.create({
      productId: product._id,
      productName: product.title,
      userId: uid,
      author: userName,
      rating: dto.rating,
      title: dto.title,
      body: dto.body,
      status: 'pending',
      verifiedPurchase,
    });
  }

  listMine(userId: string): Promise<ReviewDocument[]> {
    return this.reviewModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).exec();
  }

  async removeOwn(userId: string, id: string): Promise<void> {
    const review = await this.reviewModel
      .findOneAndDelete({ _id: id, userId: new Types.ObjectId(userId) })
      .exec();
    if (!review) throw new NotFoundException('Review not found');
    await this.recomputeProductRating(review.productId);
  }

  // ---------- Admin moderation ----------

  async adminList(query: { q?: string; status?: ReviewStatus; page: number; pageSize: number }) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.q) {
      const rx = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ productName: rx }, { author: rx }, { title: rx }];
    }

    const [items, total, pendingCount] = await Promise.all([
      this.reviewModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).exec(),
      this.reviewModel.countDocuments(filter),
      this.reviewModel.countDocuments({ status: 'pending' }),
    ]);
    return { ...paginate(items, total, query.page, query.pageSize), pendingCount };
  }

  async setStatus(id: string, status: 'approved' | 'rejected'): Promise<ReviewDocument> {
    const review = await this.reviewModel.findById(id).exec();
    if (!review) throw new NotFoundException('Review not found');
    review.status = status;
    await review.save();
    await this.recomputeProductRating(review.productId);
    return review;
  }

  async remove(id: string): Promise<void> {
    const review = await this.reviewModel.findByIdAndDelete(id).exec();
    if (!review) throw new NotFoundException('Review not found');
    await this.recomputeProductRating(review.productId);
  }

  /** Keeps product.rating/ratingCount/reviewCount in sync with approved reviews. */
  async recomputeProductRating(productId: Types.ObjectId): Promise<void> {
    const [agg] = await this.reviewModel.aggregate<{ avg: number; count: number }>([
      { $match: { productId, status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await this.productModel.updateOne(
      { _id: productId },
      {
        $set: {
          rating: agg ? Math.round(agg.avg * 10) / 10 : 0,
          ratingCount: agg?.count ?? 0,
          reviewCount: agg?.count ?? 0,
        },
      },
    );
  }
}
