import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as XLSX from 'xlsx';
import * as unzipper from 'unzipper';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Brand, BrandDocument } from '../brands/schemas/brand.schema';
import { ProductsService } from '../products/products.service';

export interface ProductRow {
  title?: string;
  brand?: string;
  category?: string;
  price?: number;
  mrp?: number;
  stock?: number;
  description?: string;
  shortDescription?: string;
  sku?: string;
  hsnCode?: string;
  tags?: string;
  highlights?: string;
  faqs?: string; // JSON stringified array of {question,answer}
  specs?: string; // JSON stringified array of {label,value}
  weightPerUnit?: number;
  weightUnit?: 'kg' | 'g';
  discountPercent?: number;
  gstPercent?: number;
  status?: 'draft' | 'published';
  isActive?: boolean;
  deliveryDays?: number;
  returnDays?: number;
  isPpdOriginal?: boolean;
  isFreeDelivery?: boolean;
}

export interface BulkImportResult {
  jobId: string;
  status: 'success' | 'partial' | 'failed';
  timestamp: Date;
  summary: {
    totalProducts: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    totalImages: number;
    matchedImages: number;
  };
  products: Array<{
    title: string;
    brand: string;
    status: 'created' | 'updated' | 'failed' | 'skipped';
    images: number;
    errors?: string[];
  }>;
  warnings: string[];
}

@Injectable()
export class BulkImportService {
  private readonly logger = new Logger(BulkImportService.name);

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Brand.name) private readonly brandModel: Model<BrandDocument>,
    private readonly productsService: ProductsService,
  ) {}

  /**
   * Extract and organize images from ZIP file
   * Expects filenames like: ProductName.jpg, ProductName_1.jpg, ProductName_2.jpg
   */
  async extractImagesFromZip(zipBuffer: Buffer): Promise<Map<string, string[]>> {
    const imageMap = new Map<string, string[]>();

    try {
      const entries = await unzipper.Open.buffer(zipBuffer);

      // Process each file in the ZIP
      for (const entry of entries.files) {
        const filename = entry.path.split('/').pop(); // Get filename only
        if (!filename) continue;

        // Skip non-image files
        if (!this.isImageFile(filename)) continue;

        // Extract image data
        const imageData = await entry.buffer();
        const base64 = `data:${this.getMimeType(filename)};base64,${imageData.toString('base64')}`;

        // Parse filename to get product name
        const productName = this.extractProductNameFromFilename(filename);
        if (!productName) {
          this.logger.warn(`Could not extract product name from: ${filename}`);
          continue;
        }

        // Add to map
        if (!imageMap.has(productName)) {
          imageMap.set(productName, []);
        }
        imageMap.get(productName)!.push(base64);
      }

      this.logger.log(`Extracted ${imageMap.size} products with images from ZIP`);
      return imageMap;
    } catch (error) {
      throw new BadRequestException(
        `Failed to extract images from ZIP: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Parse CSV file
   */
  async parseCsv(csvBuffer: Buffer): Promise<ProductRow[]> {
    const MAX_ROWS = 10000; // Prevent memory exhaustion from massive CSV files

    try {
      const workbook = XLSX.read(csvBuffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<ProductRow>(worksheet);

      if (rows.length === 0) {
        throw new BadRequestException('CSV file is empty');
      }

      if (rows.length > MAX_ROWS) {
        throw new BadRequestException(
          `CSV file contains too many rows (${rows.length}). Maximum allowed: ${MAX_ROWS}`,
        );
      }

      return rows;
    } catch (error) {
      throw new BadRequestException(
        `Failed to parse CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Validate and import products with images
   */
  async importProducts(
    rows: ProductRow[],
    imageMap: Map<string, string[]>,
  ): Promise<BulkImportResult> {
    const jobId = this.generateJobId();
    const result: BulkImportResult = {
      jobId,
      status: 'success',
      timestamp: new Date(),
      summary: {
        totalProducts: rows.length,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalImages: Array.from(imageMap.values()).reduce((sum, imgs) => sum + imgs.length, 0),
        matchedImages: 0,
      },
      products: [],
      warnings: [],
    };

    // Load reference data
    const categories = await this.categoryModel.find({}).lean().exec();
    const brands = await this.brandModel.find({}).lean().exec();
    const categoryMap = new Map(categories.map((c: any) => [c.slug, c._id]));
    const brandSet = new Set(brands.map((b: any) => b.name));

    // Process each product
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const productRecord: BulkImportResult['products'][0] = {
        title: row.title || 'Unknown',
        brand: row.brand || 'Unknown',
        status: 'failed',
        images: 0,
        errors: [],
      };

      try {
        // Validate required fields
        if (!row.title?.trim()) {
          throw new Error('Title is required');
        }
        if (!row.brand?.trim()) {
          throw new Error('Brand is required');
        }
        if (!row.category?.trim()) {
          throw new Error('Category is required');
        }
        if (row.price == null || row.price < 0) {
          throw new Error('Price must be a positive number');
        }
        if (row.mrp == null || row.mrp < 0) {
          throw new Error('MRP must be a positive number');
        }
        if (row.price > row.mrp) {
          throw new Error('Price cannot be greater than MRP');
        }
        if (row.stock == null || row.stock < 0) {
          throw new Error('Stock must be a non-negative number');
        }

        // Normalize category
        const categorySlug = row.category.toLowerCase().trim().replace(/\s+/g, '-');
        if (!categoryMap.has(categorySlug)) {
          throw new Error(`Category "${row.category}" not found in system`);
        }

        // Create or fetch brand
        const brandName = row.brand.trim();
        if (!brandSet.has(brandName)) {
          await this.brandModel.create({ name: brandName });
          brandSet.add(brandName);
        }

        // Parse array fields
        const highlights = row.highlights
          ? row.highlights.split(';').map((s) => s.trim()).filter(Boolean)
          : [];
        const tags = row.tags
          ? row.tags.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
          : [];

        // Get images from ZIP (match by product name)
        const images = imageMap.get(row.title.trim()) || [];
        if (images.length > 0) {
          result.summary.matchedImages += images.length;
        } else if (imageMap.size > 0) {
          // Warn if ZIP was provided but no images found for this product
          result.warnings.push(`No images found for product "${row.title}" in ZIP file`);
        }

        const productData = {
          title: row.title.trim(),
          brand: brandName,
          category: categorySlug,
          price: Math.round(Number(row.price)),
          mrp: Math.round(Number(row.mrp)),
          stock: Math.round(Number(row.stock)),
          description: row.description?.trim() ?? '',
          shortDescription: row.shortDescription?.trim() ?? '',
          sku: row.sku?.trim() ?? '',
          hsnCode: row.hsnCode?.trim() ?? '',
          images,
          highlights,
          tags: tags as any,
          faqs: this.parseJsonField(row.faqs) as any,
          specs: this.parseJsonField(row.specs) as any,
          weightPerUnit: row.weightPerUnit != null ? Number(row.weightPerUnit) : undefined,
          weightUnit: row.weightUnit as 'kg' | 'g' ?? 'kg',
          discountPercent: row.discountPercent != null ? Number(row.discountPercent) : undefined,
          gstPercent: row.gstPercent != null ? Number(row.gstPercent) : undefined,
          status: (row.status as any) ?? 'published',
          isActive: row.isActive ?? true,
          deliveryDays: row.deliveryDays ? Math.round(Number(row.deliveryDays)) : 2,
          returnDays: row.returnDays ? Math.round(Number(row.returnDays)) : 7,
          isPpdOriginal: row.isPpdOriginal ?? false,
          isFreeDelivery: row.isFreeDelivery ?? false,
        };

        // Try to find existing product by title+brand
        const existing = await this.productModel
          .findOne({ title: productData.title, brand: productData.brand })
          .exec();

        if (existing) {
          await this.productModel.findByIdAndUpdate(existing._id, productData).exec();
          productRecord.status = 'updated';
          result.summary.successCount++;
        } else {
          await this.productsService.adminCreate(productData as any);
          productRecord.status = 'created';
          result.summary.successCount++;
        }

        productRecord.images = images.length;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        productRecord.errors = [errorMsg];
        productRecord.status = 'failed';
        result.summary.failedCount++;
        this.logger.warn(
          `Product ${row.title} (${row.brand}) - Row ${i + 2}: ${errorMsg}`,
        );
      }

      result.products.push(productRecord);
    }

    // Determine overall status
    if (result.summary.failedCount === 0) {
      result.status = 'success';
    } else if (result.summary.failedCount < rows.length) {
      result.status = 'partial';
    } else {
      result.status = 'failed';
    }

    this.logger.log(
      `Import complete: ${result.summary.successCount} success, ${result.summary.failedCount} failed, ` +
        `${result.summary.matchedImages}/${result.summary.totalImages} images matched`,
    );

    return result;
  }

  /**
   * Generate CSV template for bulk import
   */
  generateCsvTemplate(): string {
    const headers = [
      'title',
      'brand',
      'category',
      'price',
      'mrp',
      'stock',
      'description',
      'shortDescription',
      'sku',
      'hsnCode',
      'tags',
      'highlights',
      'faqs', // JSON string
      'specs', // JSON string
      'weightPerUnit',
      'weightUnit',
      'discountPercent',
      'gstPercent',
      'status',
      'isActive',
      'deliveryDays',
      'returnDays',
      'isPpdOriginal',
      'isFreeDelivery',
    ];

    const exampleRows = [
      [
        'Steel Sipper Water Bottle 750ml',
        'Classmate',
        'home-kitchen',
        '349',
        '499',
        '50',
        'Premium steel water bottle for school and office',
        'Compact, lightweight',
        'BOTTLE123',
        '9983',
        'deal,bestseller',
        'Leak-proof;Durable stainless steel;Keeps drinks hot/cold',
        '[{"question":"Warranty?","answer":"2 years"}]',
        '[{"label":"Capacity","value":"750ml"}]',
        '0.25',
        'kg',
        '10',
        '5',
        'published',
        'true',
        '2',
        '7',
        'true',
        'false',
      ],
      [
        'A5 Premium Notebook',
        'Classmate',
        'stationery',
        '89',
        '120',
        '100',
        'High quality notebook with 200 pages',
        'Compact, A5 size',
        'NOTEBOOK456',
        '9984',
        'new,featured',
        'Smooth paper;Hard bound;Great for writing',
        '[{"question":"Pages?","answer":"200"}]',
        '[{"label":"Size","value":"A5"}]',
        '0.15',
        'kg',
        '0',
        '5',
        'draft',
        'false',
        '2',
        '7',
        'false',
        'true',
      ],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    return XLSX.write(wb, { bookType: 'csv', type: 'string' });
  }

  /**
   * Private helpers
   */

  private isImageFile(filename: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    return imageExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
  }

  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
    };
    return mimeMap[ext || ''] || 'image/jpeg';
  }

  private extractProductNameFromFilename(filename: string): string | null {
    // Remove extension
    let name = filename.split('.')[0];

    // Handle numbered images: "ProductName_1", "ProductName_2", etc.
    // Or: "ProductName1", "ProductName2"
    name = name.replace(/_\d+$/, '').replace(/\d+$/, '');

    return name.trim() || null;
  }

  /**
   * Safely parse a JSON field from CSV. Returns undefined if parsing fails.
   */
  private parseJsonField(value?: string): unknown {
    if (!value) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      this.logger.warn(`Failed to parse JSON field: ${value}`);
      return undefined;
    }
  }

  private generateJobId(): string {
    return `import-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

}
