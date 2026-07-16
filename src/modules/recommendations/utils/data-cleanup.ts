import { Model } from 'mongoose';
import { ProductDocument } from '../../products/schemas/product.schema';

/**
 * Data cleanup utilities for ensuring data quality
 */
export class DataCleanupUtils {
  /**
   * Cleanup products collection:
   * - Remove products with missing required fields
   * - Fix invalid prices (price > mrp or negative)
   * - Remove products with empty images array
   * - Set default values for missing fields
   * - Normalize category slugs
   */
  static async cleanupProducts(
    productModel: Model<ProductDocument>,
  ): Promise<{
    processed: number;
    fixed: number;
    deleted: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let fixed = 0;
    let deleted = 0;

    try {
      // Step 1: Set defaults for missing fields
      await productModel.updateMany(
        { isActive: { $exists: false } },
        { $set: { isActive: true } },
      );

      await productModel.updateMany(
        { salesCount: { $exists: false } },
        { $set: { salesCount: 0 } },
      );

      await productModel.updateMany(
        { rating: { $exists: false } },
        { $set: { rating: 0 } },
      );

      await productModel.updateMany(
        { ratingCount: { $exists: false } },
        { $set: { ratingCount: 0 } },
      );

      await productModel.updateMany(
        { images: { $exists: false } },
        { $set: { images: [] } },
      );

      // Step 2: Fix invalid prices
      const allProducts = await productModel.find({}).exec();
      const processed = allProducts.length;

      for (const product of allProducts) {
        const updates: Partial<ProductDocument> = {};
        let needsUpdate = false;

        // Ensure price is valid number
        if (typeof product.price !== 'number' || product.price < 0) {
          updates.price = 0;
          needsUpdate = true;
          errors.push(`Product ${product._id}: Invalid price ${product.price}`);
        }

        // Ensure mrp is valid number
        if (typeof product.mrp !== 'number' || product.mrp < 0) {
          updates.mrp = product.price || 0;
          needsUpdate = true;
          errors.push(`Product ${product._id}: Invalid MRP ${product.mrp}`);
        }

        // Fix price > mrp
        if (product.price > product.mrp) {
          updates.mrp = product.price;
          needsUpdate = true;
          errors.push(`Product ${product._id}: Price > MRP`);
        }

        // Normalize category
        if (product.category) {
          const normalized = product.category.toLowerCase().trim();
          if (normalized !== product.category) {
            updates.category = normalized;
            needsUpdate = true;
          }
        }

        // Normalize brand
        if (product.brand && typeof product.brand === 'string') {
          const normalized = product.brand.trim();
          if (normalized !== product.brand) {
            updates.brand = normalized;
            needsUpdate = true;
          }
        }

        // Normalize title
        if (product.title && typeof product.title === 'string') {
          const normalized = product.title.trim();
          if (normalized !== product.title) {
            updates.title = normalized;
            needsUpdate = true;
          }
        }

        // Ensure slug is unique
        if (!product.slug) {
          const title = product.title || `product-${product._id}`;
          updates.slug = `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
          needsUpdate = true;
          errors.push(`Product ${product._id}: Missing slug`);
        }

        // Ensure stock is valid
        if (typeof product.stock !== 'number' || product.stock < 0) {
          updates.stock = 0;
          needsUpdate = true;
          errors.push(`Product ${product._id}: Invalid stock ${product.stock}`);
        }

        // Ensure deliveryDays has default
        if (!product.deliveryDays || product.deliveryDays <= 0) {
          updates.deliveryDays = 2;
          needsUpdate = true;
        }

        // Ensure returnDays has default
        if (!product.returnDays || product.returnDays <= 0) {
          updates.returnDays = 7;
          needsUpdate = true;
        }

        // Update if needed
        if (needsUpdate) {
          await productModel.findByIdAndUpdate(product._id, { $set: updates }).exec();
          fixed++;
        }
      }

      // Step 3: Delete invalid products (missing critical fields)
      const deleteResult = await productModel.deleteMany({
        $or: [
          { title: { $exists: false } },
          { title: '' },
          { category: { $exists: false } },
          { category: '' },
          { price: { $exists: false } },
          { mrp: { $exists: false } },
          { images: { $exists: false, $type: 'array', $eq: [] } },
        ],
      });

      deleted = deleteResult.deletedCount || 0;

      return { processed, fixed, deleted, errors };
    } catch (error) {
      errors.push(`Cleanup error: ${error.message}`);
      return { processed: 0, fixed: 0, deleted: 0, errors };
    }
  }

  /**
   * Validate a single product object
   */
  static validateProduct(product: any): { valid: boolean; errors: string[] } {
    const validationErrors: string[] = [];

    // Required fields
    if (!product._id) validationErrors.push('Missing _id');
    if (!product.title || typeof product.title !== 'string' || product.title.trim() === '') {
      validationErrors.push('Missing or invalid title');
    }
    if (!product.category || typeof product.category !== 'string') {
      validationErrors.push('Missing or invalid category');
    }
    if (typeof product.price !== 'number' || product.price < 0) {
      validationErrors.push('Invalid price');
    }
    if (typeof product.mrp !== 'number' || product.mrp < 0) {
      validationErrors.push('Invalid MRP');
    }
    if (product.price > product.mrp) {
      validationErrors.push('Price cannot be greater than MRP');
    }
    if (typeof product.stock !== 'number' || product.stock < 0) {
      validationErrors.push('Invalid stock');
    }
    if (!product.images || !Array.isArray(product.images) || product.images.length === 0) {
      validationErrors.push('Missing images');
    }

    // Optional but should exist
    if (typeof product.rating !== 'number') validationErrors.push('Invalid rating');
    if (typeof product.ratingCount !== 'number') validationErrors.push('Invalid ratingCount');
    if (typeof product.salesCount !== 'number') validationErrors.push('Invalid salesCount');

    return {
      valid: validationErrors.length === 0,
      errors: validationErrors,
    };
  }

  /**
   * Generate data quality report
   */
  static async generateQualityReport(
    productModel: Model<ProductDocument>,
  ): Promise<{
    totalProducts: number;
    activeProducts: number;
    inactiveProducts: number;
    validProducts: number;
    invalidProducts: number;
    productsWithNoStock: number;
    productsWithNoImages: number;
    productsWithZeroPrice: number;
    productsWithoutBrand: number;
    averageRating: number;
    averageSalesCount: number;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      const totalProducts = await productModel.countDocuments({});
      const activeProducts = await productModel.countDocuments({ isActive: true });
      const inactiveProducts = await productModel.countDocuments({ isActive: false });
      const productsWithNoStock = await productModel.countDocuments({ stock: { $lte: 0 } });
      const productsWithNoImages = await productModel.countDocuments({
        $or: [{ images: { $exists: false } }, { images: [] }],
      });
      const productsWithZeroPrice = await productModel.countDocuments({ price: 0 });
      const productsWithoutBrand = await productModel.countDocuments({
        $or: [{ brand: { $exists: false } }, { brand: '' }],
      });

      const products = await productModel.find({}).select('rating salesCount').exec();

      const averageRating =
        products.length > 0
          ? products.reduce((sum, p) => sum + (p.rating || 0), 0) / products.length
          : 0;

      const averageSalesCount =
        products.length > 0
          ? products.reduce((sum, p) => sum + (p.salesCount || 0), 0) / products.length
          : 0;

      // Count invalid products
      let invalidProducts = 0;
      let validProducts = 0;

      for (const product of products) {
        const validation = this.validateProduct(product);
        if (validation.valid) {
          validProducts++;
        } else {
          invalidProducts++;
        }
      }

      // Generate issues
      if (inactiveProducts > totalProducts * 0.2) {
        issues.push(`${inactiveProducts} inactive products (${((inactiveProducts / totalProducts) * 100).toFixed(1)}%)`);
      }

      if (productsWithNoStock > 0) {
        issues.push(`${productsWithNoStock} products out of stock`);
      }

      if (productsWithNoImages > 0) {
        issues.push(`${productsWithNoImages} products without images`);
      }

      if (productsWithZeroPrice > 0) {
        issues.push(`${productsWithZeroPrice} products with zero price`);
      }

      if (productsWithoutBrand > 0) {
        issues.push(`${productsWithoutBrand} products without brand`);
      }

      if (invalidProducts > totalProducts * 0.1) {
        issues.push(`${invalidProducts} invalid products (${((invalidProducts / totalProducts) * 100).toFixed(1)}%)`);
      }

      return {
        totalProducts,
        activeProducts,
        inactiveProducts,
        validProducts,
        invalidProducts,
        productsWithNoStock,
        productsWithNoImages,
        productsWithZeroPrice,
        productsWithoutBrand,
        averageRating: parseFloat(averageRating.toFixed(2)),
        averageSalesCount: parseFloat(averageSalesCount.toFixed(2)),
        issues,
      };
    } catch (error) {
      issues.push(`Report generation error: ${error.message}`);
      return {
        totalProducts: 0,
        activeProducts: 0,
        inactiveProducts: 0,
        validProducts: 0,
        invalidProducts: 0,
        productsWithNoStock: 0,
        productsWithNoImages: 0,
        productsWithZeroPrice: 0,
        productsWithoutBrand: 0,
        averageRating: 0,
        averageSalesCount: 0,
        issues,
      };
    }
  }
}
