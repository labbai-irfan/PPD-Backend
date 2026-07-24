import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PRODUCT_TAGS } from '../schemas/product.schema';

export class FaqDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  question: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  answer: string;
}

export class SpecDto {
  @ApiProperty({ example: 'Material' })
  @IsString()
  @MinLength(1)
  label: string;

  @ApiProperty({ example: 'High Carbon Steel' })
  @IsString()
  @MinLength(1)
  value: string;
}

export class BatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  sku: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  calculatedPrice?: number;

  @ApiPropertyOptional({ enum: ['none', 'percentage', 'fixed'] })
  @IsOptional()
  @IsIn(['none', 'percentage', 'fixed'])
  discountType?: 'none' | 'percentage' | 'fixed';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @ApiProperty({ example: 450 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice: number;

  @ApiProperty({ enum: ['auto', 'custom'] })
  @IsIn(['auto', 'custom'])
  pricingMode: 'auto' | 'custom';

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  displayOrder?: number;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'hidden'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'hidden'])
  status?: 'active' | 'inactive' | 'hidden';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['none', 'popular', 'best-seller', 'recommended', 'most-value', 'limited-offer'] })
  @IsOptional()
  @IsIn(['none', 'popular', 'best-seller', 'recommended', 'most-value', 'limited-offer'])
  badge?: 'none' | 'popular' | 'best-seller' | 'recommended' | 'most-value' | 'limited-offer';

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  minOrderCount?: number;

  @ApiPropertyOptional({ example: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxOrderCount?: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'A5 Premium Notebook' })
  @IsString()
  @MinLength(3)
  title: string;

  @ApiProperty({ example: 'Classmate' })
  @IsString()
  @MinLength(1)
  brand: string;

  @ApiProperty({ example: 'stationery', description: 'Category slug' })
  @IsString()
  @MinLength(1)
  category: string;

  @ApiProperty({ example: 199 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 199 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiProperty({ example: 299 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mrp: number;

  @ApiPropertyOptional({ description: 'Actual stock quantity of the product' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ description: 'Actual stock quantity of the product' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  @ApiProperty({ minLength: 20 })
  @IsString()
  @MinLength(20)
  description: string;

  @ApiPropertyOptional({ description: 'Short blurb shown above the full description' })
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hsnCode?: string;

  @ApiPropertyOptional({ type: [FaqDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaqDto)
  faqs?: FaqDto[];

  @ApiPropertyOptional({ type: [SpecDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecDto)
  specs?: SpecDto[];

  @ApiPropertyOptional({ type: [BatchDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchDto)
  batches?: BatchDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightPerUnit?: number;

  @ApiPropertyOptional({ enum: ['kg', 'g'] })
  @IsOptional()
  @IsIn(['kg', 'g'])
  weightUnit?: 'kg' | 'g';

  @ApiPropertyOptional({ description: 'Admin calculator input, kept for re-editing' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Admin calculator input, kept for re-editing' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  gstPercent?: number;

  @ApiPropertyOptional({ enum: ['draft', 'published'] })
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  highlights?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ enum: PRODUCT_TAGS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(PRODUCT_TAGS, { each: true })
  tags?: (typeof PRODUCT_TAGS)[number][];

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliveryDays?: number;

  @ApiPropertyOptional({ default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  returnDays?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPpdOriginal?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFreeDelivery?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  freeDeliveryThreshold?: number;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class AdminProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search title/brand' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ['in-stock', 'low', 'out'] })
  @IsOptional()
  @IsIn(['in-stock', 'low', 'out'])
  stockStatus?: 'in-stock' | 'low' | 'out';

  @ApiPropertyOptional({ enum: ['newest', 'name-asc', 'stock-asc', 'stock-desc'], default: 'newest' })
  @IsOptional()
  @IsIn(['newest', 'name-asc', 'stock-asc', 'stock-desc'])
  sort?: 'newest' | 'name-asc' | 'stock-asc' | 'stock-desc';
}
