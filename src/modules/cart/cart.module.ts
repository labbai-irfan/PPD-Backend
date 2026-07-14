import { Body, Controller, Delete, Get, HttpCode, Module, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { ProductsModule } from '../products/products.module';

export type CartDocument = HydratedDocument<Cart>;

/** One cart per user; prices are never stored — always hydrated live. */
@Schema({ timestamps: true })
export class Cart {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({
    type: [{ productId: String, quantity: Number, selections: { type: Object, default: {} } }],
    default: [],
  })
  items: { productId: string; quantity: number; selections: Record<string, string> }[];

  @Prop({ type: String, default: null })
  couponCode: string | null;
}

export const CartSchema = SchemaFactory.createForClass(Cart);

class CartItemDto {
  @ApiProperty() @IsString() productId: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsObject() selections?: Record<string, string>;
}

class SyncCartDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() couponCode?: string;
}

@ApiTags('account')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My cart, hydrated with current prices and stock' })
  async get(@CurrentUser('sub') userId: string) {
    const cart = await this.cartModel.findOne({ userId: new Types.ObjectId(userId) }).exec();
    if (!cart || cart.items.length === 0) return { items: [], couponCode: cart?.couponCode ?? null };

    const products = await this.productModel
      .find({ _id: { $in: cart.items.map((i) => i.productId) }, isActive: true })
      .exec();
    const byId = new Map(products.map((p) => [p._id.toHexString(), p]));

    const items = cart.items.flatMap((item) => {
      const p = byId.get(item.productId);
      if (!p) return []; // product removed — drop silently
      return [{
        productId: item.productId,
        quantity: item.quantity,
        selections: item.selections,
        title: p.title,
        brand: p.brand,
        image: p.images[0] ?? '',
        price: p.price,
        mrp: p.mrp,
        stock: p.stock,
      }];
    });
    return { items, couponCode: cart.couponCode };
  }

  @Put()
  @ApiOperation({ summary: 'Replace my cart (full sync from the client store)' })
  async sync(@CurrentUser('sub') userId: string, @Body() dto: SyncCartDto) {
    const uid = new Types.ObjectId(userId);
    await this.cartModel.updateOne(
      { userId: uid },
      {
        $set: {
          items: dto.items.map((i) => ({ ...i, selections: i.selections ?? {} })),
          couponCode: dto.couponCode ?? null,
        },
      },
      { upsert: true },
    );
    return { synced: true, count: dto.items.length };
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Clear my cart' })
  async clear(@CurrentUser('sub') userId: string) {
    await this.cartModel.updateOne(
      { userId: new Types.ObjectId(userId) },
      { $set: { items: [], couponCode: null } },
    );
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cart.name, schema: CartSchema }]),
    ProductsModule,
  ],
  controllers: [CartController],
  exports: [MongooseModule],
})
export class CartModule {}
