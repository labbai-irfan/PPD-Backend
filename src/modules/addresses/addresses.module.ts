import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

// ---------- Schema ----------

export type AddressDocument = HydratedDocument<Address>;

@Schema({ timestamps: true })
export class Address {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true }) name: string;
  @Prop({ required: true }) phone: string;
  @Prop({ required: true }) line1: string;
  @Prop({ default: '' }) line2: string;
  @Prop({ required: true }) city: string;
  @Prop({ required: true }) state: string;
  @Prop({ required: true }) pincode: string;
  @Prop({ type: String, enum: ['home', 'work', 'other'], default: 'home' }) type: string;
  @Prop({ default: false }) isDefault: boolean;
}

export const AddressSchema = SchemaFactory.createForClass(Address);

// ---------- DTOs ----------

class CreateAddressDto {
  @ApiProperty() @IsString() @MinLength(2) name: string;
  @ApiProperty() @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile' }) phone: string;
  @ApiProperty() @IsString() @MinLength(3) line1: string;
  @ApiPropertyOptional() @IsOptional() @IsString() line2?: string;
  @ApiProperty() @IsString() @MinLength(2) city: string;
  @ApiProperty() @IsString() @MinLength(2) state: string;
  @ApiProperty() @Matches(/^\d{6}$/, { message: 'pincode must be 6 digits' }) pincode: string;
  @ApiPropertyOptional({ enum: ['home', 'work', 'other'] }) @IsOptional() @IsIn(['home', 'work', 'other']) type?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

class UpdateAddressDto extends PartialType(CreateAddressDto) {}

// ---------- Controller ----------

@ApiTags('account')
@ApiBearerAuth()
@Controller('addresses')
export class AddressesController {
  constructor(@InjectModel(Address.name) private readonly addressModel: Model<AddressDocument>) {}

  @Get()
  @ApiOperation({ summary: 'My addresses' })
  list(@CurrentUser('sub') userId: string) {
    return this.addressModel.find({ userId: new Types.ObjectId(userId) }).sort({ isDefault: -1, createdAt: 1 }).exec();
  }

  @Post()
  @ApiOperation({ summary: 'Add address (first one becomes default)' })
  async create(@CurrentUser('sub') userId: string, @Body() dto: CreateAddressDto) {
    const uid = new Types.ObjectId(userId);
    const count = await this.addressModel.countDocuments({ userId: uid });
    const makeDefault = count === 0 || dto.isDefault === true;
    if (makeDefault) await this.addressModel.updateMany({ userId: uid }, { isDefault: false });
    return this.addressModel.create({ ...dto, userId: uid, isDefault: makeDefault });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update address' })
  async update(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const address = await this.findOwn(userId, String(id));
    if (dto.isDefault === true) {
      await this.addressModel.updateMany({ userId: address.userId }, { isDefault: false });
    }
    Object.assign(address, dto);
    return address.save();
  }

  @Post(':id/default')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set as default address' })
  async setDefault(@CurrentUser('sub') userId: string, @Param('id', ParseObjectIdPipe) id: string) {
    const address = await this.findOwn(userId, String(id));
    await this.addressModel.updateMany({ userId: address.userId }, { isDefault: false });
    address.isDefault = true;
    return address.save();
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete address (default passes to the oldest remaining)' })
  async remove(@CurrentUser('sub') userId: string, @Param('id', ParseObjectIdPipe) id: string) {
    const address = await this.findOwn(userId, String(id));
    const wasDefault = address.isDefault;
    await address.deleteOne();
    if (wasDefault) {
      const next = await this.addressModel.findOne({ userId: address.userId }).sort({ createdAt: 1 }).exec();
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }
  }

  private async findOwn(userId: string, id: string): Promise<AddressDocument> {
    const address = await this.addressModel.findOne({ _id: id, userId: new Types.ObjectId(userId) }).exec();
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Address.name, schema: AddressSchema }])],
  controllers: [AddressesController],
  exports: [MongooseModule],
})
export class AddressesModule {}
