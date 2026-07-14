import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

export type PaymentMethodDocument = HydratedDocument<PaymentMethod>;

/** Display-only records — no real card data beyond brand/last4. */
@Schema({ timestamps: true })
export class PaymentMethod {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: ['card', 'upi', 'wallet'], required: true }) type: string;
  @Prop({ default: '' }) brand: string;
  @Prop({ default: '' }) last4: string;
  @Prop({ default: '' }) expiry: string;
  @Prop({ default: '' }) upiId: string;
  @Prop({ default: false }) isDefault: boolean;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);

class CreatePaymentMethodDto {
  @ApiProperty({ enum: ['card', 'upi', 'wallet'] }) @IsIn(['card', 'upi', 'wallet']) type: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() last4?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() upiId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

@ApiTags('account')
@ApiBearerAuth()
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(
    @InjectModel(PaymentMethod.name) private readonly pmModel: Model<PaymentMethodDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My saved payment methods' })
  list(@CurrentUser('sub') userId: string) {
    return this.pmModel.find({ userId: new Types.ObjectId(userId) }).sort({ isDefault: -1, createdAt: 1 }).exec();
  }

  @Post()
  @ApiOperation({ summary: 'Save a payment method' })
  async create(@CurrentUser('sub') userId: string, @Body() dto: CreatePaymentMethodDto) {
    const uid = new Types.ObjectId(userId);
    const count = await this.pmModel.countDocuments({ userId: uid });
    const makeDefault = count === 0 || dto.isDefault === true;
    if (makeDefault) await this.pmModel.updateMany({ userId: uid }, { isDefault: false });
    return this.pmModel.create({ ...dto, userId: uid, isDefault: makeDefault });
  }

  @Post(':id/default')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set default payment method' })
  async setDefault(@CurrentUser('sub') userId: string, @Param('id', ParseObjectIdPipe) id: string) {
    const pm = await this.pmModel.findOne({ _id: String(id), userId: new Types.ObjectId(userId) }).exec();
    if (!pm) throw new NotFoundException('Payment method not found');
    await this.pmModel.updateMany({ userId: pm.userId }, { isDefault: false });
    pm.isDefault = true;
    return pm.save();
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a payment method' })
  async remove(@CurrentUser('sub') userId: string, @Param('id', ParseObjectIdPipe) id: string) {
    const result = await this.pmModel.deleteOne({ _id: String(id), userId: new Types.ObjectId(userId) }).exec();
    if (result.deletedCount === 0) throw new NotFoundException('Payment method not found');
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: PaymentMethod.name, schema: PaymentMethodSchema }])],
  controllers: [PaymentMethodsController],
  exports: [MongooseModule],
})
export class PaymentMethodsModule {}
