import { BadRequestException, Body, Controller, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as XLSX from 'xlsx';

import { Roles } from '../../common/decorators/roles.decorator';
import { Product, ProductDocument, ProductSchema } from '../products/schemas/product.schema';
import { Category, CategoryDocument, CategorySchema } from '../categories/schemas/category.schema';
import { Brand, BrandDocument, BrandSchema } from '../brands/schemas/brand.schema';
import { ProductsService } from '../products/products.service';

interface ProductRow {
  title?: string;
  brand?: string;
  category?: string;
  price?: number;
  mrp?: number;
  stock?: number;
  description?: string;
  images?: string;
  tags?: string;
  highlights?: string;
  deliveryDays?: number;
  returnDays?: number;
}

interface BulkImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/bulk-import')
export class BulkImportController {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Brand.name) private readonly brandModel: Model<BrandDocument>,
    private readonly productsService: ProductsService,
  ) {}

  @Post('products')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Bulk import/update products from Excel',
    description: 'Upload an Excel file with product data. Columns: title, brand, category, price, mrp, stock, description, images (comma-separated URLs), tags, highlights (semicolon-separated), deliveryDays, returnDays.',
  })
  async importProducts(@UploadedFile() file?: Express.Multer.File): Promise<BulkImportResult> {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(file.mimetype)) {
      throw new BadRequestException('Only Excel files (.xlsx, .xls) are allowed');
    }

    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<ProductRow>(worksheet);

      const result: BulkImportResult = { success: 0, failed: 0, errors: [] };
      const categories = await this.categoryModel.find({}).lean().exec();
      const brands = await this.brandModel.find({}).lean().exec();
      const categoryMap = new Map(categories.map((c: any) => [c.slug, c._id]));
      const brandSet = new Set(brands.map((b: any) => b.name));

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // Validate required fields
          if (!row.title || !row.brand || !row.category || row.price === undefined || row.mrp === undefined || row.stock === undefined) {
            throw new Error('Missing required fields: title, brand, category, price, mrp, stock');
          }

          // Check category exists
          const categorySlug = row.category.toLowerCase().replace(/\s+/g, '-');
          if (!categoryMap.has(categorySlug)) {
            throw new Error(`Category "${row.category}" not found`);
          }

          // Create or fetch brand
          if (!brandSet.has(row.brand)) {
            await this.brandModel.create({ name: row.brand });
            brandSet.add(row.brand);
          }

          // Parse comma-separated images
          const images = row.images ? row.images.split(',').map((s) => s.trim()).filter(Boolean) : [];

          // Parse semicolon-separated highlights
          const highlights = row.highlights ? row.highlights.split(';').map((s) => s.trim()).filter(Boolean) : [];

          // Parse comma-separated tags
          const tags = row.tags ? row.tags.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];

          const productData = {
            title: row.title.trim(),
            brand: row.brand.trim(),
            category: categorySlug,
            price: Math.round(Number(row.price)),
            mrp: Math.round(Number(row.mrp)),
            stock: Math.round(Number(row.stock)),
            description: row.description?.trim() ?? '',
            images,
            highlights,
            tags: tags as any,
            deliveryDays: row.deliveryDays ? Math.round(Number(row.deliveryDays)) : 5,
            returnDays: row.returnDays ? Math.round(Number(row.returnDays)) : 7,
            isActive: true,
          };

          // Try to find existing product by title+brand
          const existing = await this.productModel.findOne({ title: productData.title, brand: productData.brand }).exec();
          if (existing) {
            await this.productModel.findByIdAndUpdate(existing._id, productData).exec();
          } else {
            await this.productsService.adminCreate(productData as any);
          }
          result.success++;
        } catch (error) {
          result.failed++;
          result.errors.push({ row: i + 2, error: error instanceof Error ? error.message : 'Unknown error' }); // Row i+2 (1-indexed + header)
        }
      }

      return result;
    } catch (error) {
      throw new BadRequestException(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Brand.name, schema: BrandSchema },
    ]),
  ],
  controllers: [BulkImportController],
  providers: [ProductsService],
})
export class BulkImportModule {}
