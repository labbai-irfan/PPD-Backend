import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Brand, BrandSchema } from '../brands/schemas/brand.schema';
import { ProductsService } from '../products/products.service';
import { BulkImportService } from './bulk-import.service';
import { BulkImportController } from './bulk-import.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Brand.name, schema: BrandSchema },
    ]),
  ],
  controllers: [BulkImportController],
  providers: [BulkImportService, ProductsService],
  exports: [BulkImportService],
})
export class BulkImportModule {}
