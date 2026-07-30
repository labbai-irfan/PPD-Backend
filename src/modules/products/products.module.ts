import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema, InventoryLog, InventoryLogSchema } from './schemas/product.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Wishlist, WishlistSchema } from '../wishlist/wishlist.module';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { AdminProductsController } from './admin-products.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: InventoryLog.name, schema: InventoryLogSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Wishlist.name, schema: WishlistSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
  ],
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsService],
  exports: [ProductsService, MongooseModule],
})
export class ProductsModule {}
