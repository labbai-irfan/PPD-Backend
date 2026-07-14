import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  /** Active categories with productCount computed live (never drifts). */
  async list() {
    const [categories, counts, totalActive] = await Promise.all([
      this.categoryModel.find({ isActive: true }).sort({ sortOrder: 1 }).exec(),
      this.productModel.aggregate<{ _id: string; count: number }>([
        { $match: { isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      this.productModel.countDocuments({ isActive: true }),
    ]);

    const countBySlug = new Map(counts.map((c) => [c._id, c.count]));

    return categories.map((cat) => ({
      ...cat.toObject(),
      productCount: cat.slug === 'all' ? totalActive : (countBySlug.get(cat.slug) ?? 0),
    }));
  }
}
