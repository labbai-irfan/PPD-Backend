import { Body, Controller, Delete, Get, HttpCode, Module, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

export type WishlistDocument = HydratedDocument<Wishlist>;

@Schema({ timestamps: true })
export class Wishlist {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  productIds: string[];
}

export const WishlistSchema = SchemaFactory.createForClass(Wishlist);

class ToggleWishlistDto {
  @ApiProperty() @IsString() productId: string;
}

@ApiTags('account')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(@InjectModel(Wishlist.name) private readonly wishlistModel: Model<WishlistDocument>) {}

  @Get()
  @ApiOperation({ summary: 'My wishlist product ids' })
  async get(@CurrentUser('sub') userId: string) {
    const doc = await this.wishlistModel.findOne({ userId: new Types.ObjectId(userId) }).exec();
    return { productIds: doc?.productIds ?? [] };
  }

  @Post('toggle')
  @HttpCode(200)
  @ApiOperation({ summary: 'Toggle a product in the wishlist' })
  async toggle(@CurrentUser('sub') userId: string, @Body() dto: ToggleWishlistDto) {
    const uid = new Types.ObjectId(userId);
    const doc =
      (await this.wishlistModel.findOne({ userId: uid }).exec()) ??
      (await this.wishlistModel.create({ userId: uid, productIds: [] }));

    const idx = doc.productIds.indexOf(dto.productId);
    if (idx >= 0) doc.productIds.splice(idx, 1);
    else doc.productIds.unshift(dto.productId);
    await doc.save();
    return { productIds: doc.productIds };
  }

  @Delete(':productId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a product from the wishlist' })
  async remove(@CurrentUser('sub') userId: string, @Param('productId') productId: string) {
    const doc = await this.wishlistModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $pull: { productIds: productId } },
        { new: true },
      )
      .exec();
    return { productIds: doc?.productIds ?? [] };
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Wishlist.name, schema: WishlistSchema }])],
  controllers: [WishlistController],
  exports: [MongooseModule],
})
export class WishlistModule {}
