import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as XLSX from 'xlsx';
import * as unzipper from 'unzipper';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Brand, BrandDocument } from '../brands/schemas/brand.schema';
import { ProductsService } from '../products/products.service';
import { slugify } from '../../common/utils';
import {
  parseString,
  parseNumber,
  parseBoolean,
  parseArray,
  parseJson,
  normalizeWeightUnit,
  parseSpecsString,
  parseFaqsString,
} from './bulk-import.utils';

export interface ProductRow {
  title?: any;
  brand?: any;
  category?: any;
  price?: any;
  mrp?: any;
  stock?: any;
  description?: any;
  shortDescription?: any;
  isbn?: any;
  hsnCode?: any;
  discountPercent?: any;
  gstPercent?: any;
  weightPerUnit?: any;
  weightUnit?: any;
  isFeatured?: any;
  isPpdOriginal?: any;
  isFreeDelivery?: any;
  freeDeliveryThreshold?: any;
  faqs?: any;
  specs?: any;
}

export interface BulkImportResult {
  jobId: string;
  status: 'success' | 'partial' | 'failed';
  timestamp: Date;
  timeTakenMs?: number;
  summary: {
    totalProducts: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    totalImages: number;
    matchedImages: number;
    invalidCount: number;
  };
  products: Array<{
    title: string;
    brand: string;
    status: 'created' | 'updated' | 'failed' | 'skipped';
    images: number;
    errors?: string[];
    warnings?: string[];
  }>;
  warnings: string[];
}

const ALLOWED_WEIGHT_UNITS = [
  // Weight
  'kg', 'g', 'mg', 'lb', 'oz', 'ton',
  // Volume
  'l', 'ml', 'cl', 'fl oz', 'gal',
  // Length
  'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd',
  // Area
  'sq ft', 'sq m', 'acre',
  // Quantity / Count
  'pcs', 'pc', 'unit', 'pair', 'set', 'pack', 'box', 'carton', 'bundle', 'roll', 'sheet', 'bottle', 'jar', 'can', 'tube', 'sachet', 'pouch', 'bag', 'strip', 'blister', 'capsule', 'tablet', 'vial', 'ampoule', 'stick', 'packet', 'dozen', 'ream', 'coil', 'crate', 'pallet',
  // Time / Subscription
  'day', 'week', 'month', 'year',
  // Digital Products
  'license', 'download', 'seat'
];

@Injectable()
export class BulkImportService {
  private readonly logger = new Logger(BulkImportService.name);

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Brand.name) private readonly brandModel: Model<BrandDocument>,
    private readonly productsService: ProductsService,
  ) {}

  private isValidUrl(str: string): boolean {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Extract and organize images from ZIP file
   */
  async extractImagesFromZip(zipBuffer: Buffer): Promise<Map<string, string[]>> {
    const imageMap = new Map<string, string[]>();

    try {
      const entries = await unzipper.Open.buffer(zipBuffer);

      for (const entry of entries.files) {
        const filename = entry.path.split('/').pop();
        if (!filename) continue;

        if (!this.isImageFile(filename)) continue;

        const imageData = await entry.buffer();
        const base64 = `data:${this.getMimeType(filename)};base64,${imageData.toString('base64')}`;

        const productName = this.extractProductNameFromFilename(filename);
        if (!productName) {
          this.logger.warn(`Could not extract product name from: ${filename}`);
          continue;
        }

        const normProduct = productName.toLowerCase();
        if (!imageMap.has(normProduct)) {
          imageMap.set(normProduct, []);
        }
        imageMap.get(normProduct)!.push(base64);
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
    const MAX_ROWS = 10000;

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
    autoCreateBrands = true,
    autoCreateTags = true,
    dryRun = false,
  ): Promise<BulkImportResult> {
    const startTime = Date.now();
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
        invalidCount: 0,
      },
      products: [],
      warnings: [],
    };

    // Reference mappings for categories & brands
    const categories = await this.categoryModel.find({}).lean().exec();
    const categoryMap = new Map<string, any>();
    for (const c of categories) {
      if (c.slug) categoryMap.set(c.slug.toLowerCase().trim(), c);
      if (c.name) categoryMap.set(c.name.toLowerCase().trim(), c);
    }

    const brands = await this.brandModel.find({}).lean().exec();
    const brandMap = new Map<string, any>();
    for (const b of brands) {
      if (b.name) brandMap.set(b.name.toLowerCase().trim(), b);
    }

    // Pre-query SKU/Slug/Title for checking duplicates
    const skusToCheck = rows.map(r => parseString(r.isbn)).filter(Boolean);
    const titlesToCheck = rows.map(r => parseString(r.title)).filter(Boolean);
    const slugsToCheck = titlesToCheck.map(t => slugify(t));

    const existingDbProducts = await this.productModel.find({
      $or: [
        { sku: { $in: skusToCheck } },
        { slug: { $in: slugsToCheck } },
        { title: { $in: titlesToCheck } }
      ]
    }).lean().exec();

    const dbSkuMap = new Map<string, any>();
    const dbSlugMap = new Map<string, any>();
    const dbTitleBrandMap = new Map<string, any>();

    for (const p of existingDbProducts) {
      if (p.sku) dbSkuMap.set(p.sku.toLowerCase().trim(), p);
      if (p.slug) dbSlugMap.set(p.slug.toLowerCase().trim(), p);
      if (p.title && p.brand) {
        dbTitleBrandMap.set(`${p.title.toLowerCase().trim()}|${p.brand.toLowerCase().trim()}`, p);
      }
    }

    // Checking duplicates within the CSV file itself
    const seenISBNs = new Map<string, number>();
    const seenSlugs = new Map<string, number>();
    const seenTitleBrands = new Map<string, number>();

    const parsedRows: any[] = [];
    const validationStates: Array<{ errors: string[]; warnings: string[] }> = [];

    // Pass 1: Safe Parsing & Comprehensive Validation
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const rowErrors: string[] = [];
      const rowWarnings: string[] = [];

      // Safe parse fields through the utilities
      const title = parseString(row.title);
      const brandInput = parseString(row.brand);
      const categoryInput = parseString(row.category);
      const price = parseNumber(row.price);
      const mrp = parseNumber(row.mrp);
      const stock = parseNumber(row.stock);
      const isbn = parseString(row.isbn);
      const hsnCode = parseString(row.hsnCode);
      const weightPerUnit = row.weightPerUnit != null ? parseNumber(row.weightPerUnit) : undefined;
      const weightUnitInput = normalizeWeightUnit(row.weightUnit || 'kg');

      // Toggles
      const isFeatured = parseBoolean(row.isFeatured);
      const isPpdOriginal = parseBoolean(row.isPpdOriginal);
      const isFreeDelivery = parseBoolean(row.isFreeDelivery);
      const freeDeliveryThreshold = row.freeDeliveryThreshold != null ? parseNumber(row.freeDeliveryThreshold) : undefined;

      // Validate required fields
      if (!title) {
        rowErrors.push(`Row: ${rowNum} | Product: "${title || 'Unknown'}" | Field: title | Value: "${row.title}" | Reason: Product Title is required.`);
      }
      if (!brandInput) {
        rowErrors.push(`Row: ${rowNum} | Product: "${title || 'Unknown'}" | Field: brand | Value: "${row.brand}" | Reason: Brand is required.`);
      }
      if (!categoryInput) {
        rowErrors.push(`Row: ${rowNum} | Product: "${title || 'Unknown'}" | Field: category | Value: "${row.category}" | Reason: Category is required.`);
      }
      if (row.price == null || row.price === '') {
        rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: price | Value: "${row.price}" | Reason: Price is required.`);
      } else if (price < 0) {
        rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: price | Value: "${row.price}" | Reason: Price must be a positive number.`);
      }
      if (row.mrp == null || row.mrp === '') {
        rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: mrp | Value: "${row.mrp}" | Reason: MRP is required.`);
      } else if (mrp < 0) {
        rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: mrp | Value: "${row.mrp}" | Reason: MRP must be a positive number.`);
      }
      if (price > mrp) {
        rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: price | Value: "${price}" | Reason: Price cannot be greater than MRP.`);
      }
      if (row.stock == null || row.stock === '') {
        rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: stock | Value: "${row.stock}" | Reason: Stock count is required.`);
      } else if (stock < 0) {
        rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: stock | Value: "${row.stock}" | Reason: Stock count must be a non-negative number.`);
      }

      // Weight unit validation
      if (row.weightUnit && !ALLOWED_WEIGHT_UNITS.includes(weightUnitInput)) {
        rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: weightUnit | Value: "${row.weightUnit}" | Reason: Weight Unit must be one of: ${ALLOWED_WEIGHT_UNITS.join(', ')}`);
      }

      // Category matching slug or name case-insensitively
      let categorySlug = '';
      if (categoryInput) {
        const matchedCat = categoryMap.get(categoryInput.toLowerCase());
        if (matchedCat) {
          categorySlug = matchedCat.slug;
        } else {
          rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: category | Value: "${categoryInput}" | Reason: Category "${categoryInput}" doesn't exist. Please create it first or select an existing category.`);
        }
      }

      // Brand matching case-insensitively
      let matchedBrandName = brandInput;
      if (brandInput) {
        const matchedBrand = brandMap.get(brandInput.toLowerCase());
        if (matchedBrand) {
          matchedBrandName = matchedBrand.name;
        } else if (!autoCreateBrands) {
          rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: brand | Value: "${brandInput}" | Reason: Brand "${brandInput}" doesn't exist. Please enable auto-create or select an existing brand.`);
        }
      }

      // Duplicate detection within the CSV
      const normTitleBrand = `${title.toLowerCase()}|${brandInput.toLowerCase()}`;
      if (title && brandInput) {
        if (seenTitleBrands.has(normTitleBrand)) {
          rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: title | Value: "${title}" | Reason: Duplicate row! Product with Name "${title}" and Brand "${brandInput}" already exists in Row ${seenTitleBrands.get(normTitleBrand)! + 2} of this CSV.`);
        } else {
          seenTitleBrands.set(normTitleBrand, i);
        }
      }



      const generatedSlug = slugify(title);
      if (title) {
        const normSlug = generatedSlug.toLowerCase();
        if (seenSlugs.has(normSlug)) {
          rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: slug | Value: "${generatedSlug}" | Reason: Duplicate slug generated! Another product generates the same slug "${generatedSlug}" in Row ${seenSlugs.get(normSlug)! + 2}.`);
        } else {
          seenSlugs.set(normSlug, i);
        }
      }

      // Duplicate checks against database
      const existingDbProduct = dbTitleBrandMap.get(normTitleBrand);



      if (title) {
        const dbProductWithSlug = dbSlugMap.get(generatedSlug.toLowerCase());
        if (dbProductWithSlug) {
          if (!existingDbProduct || String(existingDbProduct._id) !== String(dbProductWithSlug._id)) {
            rowErrors.push(`Row: ${rowNum} | Product: "${title}" | Field: slug | Value: "${generatedSlug}" | Reason: Auto-generated Slug "${generatedSlug}" matches an existing product "${dbProductWithSlug.title}".`);
          }
        }
      }
      const zipImages = imageMap.get(title.toLowerCase().trim()) || [];

      if (zipImages.length > 0) {
        result.summary.matchedImages += zipImages.length;
      }

      const parsedFaqs = parseFaqsString(row.faqs);
      const parsedSpecs = parseSpecsString(row.specs);

      const productData = {
        title,
        brand: matchedBrandName,
        category: categorySlug,
        price: Math.round(price),
        mrp: Math.round(mrp),
        stock: Math.round(stock),
        description: parseString(row.description),
        shortDescription: parseString(row.shortDescription),
        sku: isbn, // Maps CSV isbn to DB sku field
        hsnCode,
        images: zipImages,
        tags: isFeatured ? ['featured'] : [],
        faqs: parsedFaqs,
        specs: parsedSpecs,
        weightPerUnit,
        weightUnit: weightUnitInput || 'kg',
        discountPercent: row.discountPercent != null ? parseNumber(row.discountPercent) : undefined,
        gstPercent: row.gstPercent != null ? parseNumber(row.gstPercent) : undefined,
        status: 'published',
        isActive: true,
        deliveryDays: 2,
        returnDays: 7,
        isPpdOriginal,
        isFreeDelivery,
        freeDeliveryThreshold,
      };

      parsedRows.push(productData);
      validationStates.push({ errors: rowErrors, warnings: rowWarnings });
    }

    // Pass 2: Write valid rows to DB (or skip if dryRun)
    for (let i = 0; i < parsedRows.length; i++) {
      const productData = parsedRows[i];
      const validation = validationStates[i];
      const originalRow = rows[i];

      const productRecord: BulkImportResult['products'][0] = {
        title: productData.title || originalRow.title || 'Unknown',
        brand: productData.brand || originalRow.brand || 'Unknown',
        status: 'failed',
        images: productData.images ? productData.images.length : 0,
        errors: validation.errors,
        warnings: validation.warnings,
      };

      if (validation.errors.length > 0) {
        productRecord.status = 'failed';
        result.summary.failedCount++;
        result.summary.invalidCount++;
      } else {
        try {
          if (dryRun) {
            const normTitleBrand = `${productData.title.toLowerCase()}|${productData.brand.toLowerCase()}`;
            const existing = dbTitleBrandMap.get(normTitleBrand);
            productRecord.status = existing ? 'updated' : 'created';
            result.summary.successCount++;
          } else {
            // Auto-create Brand if missing
            if (productData.brand) {
              const brandLower = productData.brand.toLowerCase();
              if (!brandMap.has(brandLower)) {
                const newBrand = await this.brandModel.create({ name: productData.brand });
                brandMap.set(brandLower, newBrand);
              }
            }

            const normTitleBrand = `${productData.title.toLowerCase()}|${productData.brand.toLowerCase()}`;
            const existing = dbTitleBrandMap.get(normTitleBrand);

            if (existing) {
              await this.productModel.findByIdAndUpdate(existing._id, productData).exec();
              productRecord.status = 'updated';
              result.summary.successCount++;
            } else {
              await this.productsService.adminCreate(productData as any);
              productRecord.status = 'created';
              result.summary.successCount++;
            }
          }
        } catch (error) {
          const dbError = error instanceof Error ? error.message : 'Database save failed';
          productRecord.errors = [`Row: ${i + 2} | Database write failed: ${dbError}`];
          productRecord.status = 'failed';
          result.summary.failedCount++;
        }
      }

      result.products.push(productRecord);
    }

    if (result.summary.failedCount === 0) {
      result.status = 'success';
    } else if (result.summary.failedCount < rows.length) {
      result.status = 'partial';
    } else {
      result.status = 'failed';
    }

    result.timeTakenMs = Date.now() - startTime;

    this.logger.log(
      `Import complete: ${result.summary.successCount} success, ${result.summary.failedCount} failed in ${result.timeTakenMs}ms`,
    );

    return result;
  }

  /**
   * Generate CSV template for bulk import with all supported headers
   */
  async generateCsvTemplate(): Promise<string> {
    const headers = [
      'title',
      'brand',
      'category',
      'price',
      'mrp',
      'stock',
      'description',
      'shortDescription',
      'isbn',
      'hsnCode',
      'discountPercent',
      'gstPercent',
      'weightPerUnit',
      'weightUnit',
      'isFeatured',
      'isPpdOriginal',
      'isFreeDelivery',
      'freeDeliveryThreshold',
      'faqs',
      'specs',
    ];

    const recentProducts = await this.productModel
      .find()
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();

    const exampleRows: any[][] = [];

    if (recentProducts && recentProducts.length > 0) {
      for (const p of recentProducts) {
        exampleRows.push([
          p.title || '',
          p.brand || '',
          p.category || '',
          p.price != null ? p.price.toString() : '',
          p.mrp != null ? p.mrp.toString() : '',
          p.stock != null ? p.stock.toString() : '',
          p.description || '',
          p.shortDescription || '',
          p.sku || '', // sku field stores ISBN
          p.hsnCode || '',
          p.discountPercent != null ? p.discountPercent.toString() : '',
          p.gstPercent != null ? p.gstPercent.toString() : '',
          p.weightPerUnit != null ? p.weightPerUnit.toString() : '',
          p.weightUnit || 'kg',
          p.tags ? p.tags.includes('featured').toString() : 'false',
          p.isPpdOriginal !== undefined ? p.isPpdOriginal.toString() : 'false',
          p.isFreeDelivery !== undefined ? p.isFreeDelivery.toString() : 'false',
          p.freeDeliveryThreshold != null ? p.freeDeliveryThreshold.toString() : '',
          p.faqs ? p.faqs.map(f => `${f.question}: ${f.answer}`).join('; ') : '',
          p.specs ? p.specs.map(s => `${s.label}: ${s.value}`).join('; ') : '',
        ]);
      }
    } else {
      exampleRows.push([
        'Steel Sipper Water Bottle 750ml',
        'Milton',
        'home-kitchen',
        '349',
        '499',
        '50',
        'Premium steel water bottle for school and office',
        'Compact, lightweight',
        '9783161484100',
        '9983',
        '10',
        '5',
        '0.25',
        'kg',
        'true',
        'true',
        'false',
        '',
        'Warranty?: 2 years; Is it leakproof?: Yes',
        'Capacity: 750ml; Material: Stainless Steel',
      ]);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    return XLSX.write(wb, { bookType: 'csv', type: 'string' });
  }

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
    let name = filename.split('.')[0];
    name = name.replace(/_\d+$/, '').replace(/\d+$/, '');
    return name.trim() || null;
  }

  private generateJobId(): string {
    return `import-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
