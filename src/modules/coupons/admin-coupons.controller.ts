import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

import { Coupon, CouponDocument } from './schemas/coupon.schema';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

class CreateCouponDto {
  @ApiProperty({ example: 'SUMMER20' })
  @IsString()
  @MinLength(3)
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['flat', 'percent'] })
  @IsIn(['flat', 'percent'])
  kind: 'flat' | 'percent';

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  value: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrder?: number;

  @ApiPropertyOptional({ description: 'Cap for percent coupons' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxDiscount?: number;

  @ApiProperty({ example: '2026-12-31T23:59:59Z' })
  @IsDateString()
  expiresAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpdateCouponDto extends PartialType(CreateCouponDto) {}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(@InjectModel(Coupon.name) private readonly couponModel: Model<CouponDocument>) {}

  @Get()
  @Roles('moderator')
  @ApiOperation({ summary: 'All coupons incl. expired/inactive' })
  async list() {
    const coupons = await this.couponModel.find().sort({ createdAt: -1 }).exec();
    const now = new Date();
    return coupons.map((c) => ({
      ...c.toObject(),
      status: c.expiresAt <= now ? 'expired' : c.isActive ? 'active' : 'inactive',
    }));
  }

  @Post()
  @ApiOperation({ summary: 'Create a coupon' })
  async create(@Body() dto: CreateCouponDto) {
    const exists = await this.couponModel.findOne({ code: dto.code.toUpperCase() }).exec();
    if (exists) throw new ConflictException('A coupon with this code already exists');
    return this.couponModel.create({ ...dto, code: dto.code.toUpperCase() });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a coupon' })
  async update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateCouponDto) {
    const coupon = await this.couponModel.findById(String(id)).exec();
    if (!coupon) throw new NotFoundException('Coupon not found');
    Object.assign(coupon, dto, dto.code ? { code: dto.code.toUpperCase() } : {});
    return coupon.save();
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a coupon' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    const result = await this.couponModel.deleteOne({ _id: String(id) }).exec();
    if (result.deletedCount === 0) throw new NotFoundException('Coupon not found');
  }
}
