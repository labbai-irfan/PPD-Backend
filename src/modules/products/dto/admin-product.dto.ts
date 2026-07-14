import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PRODUCT_TAGS } from '../schemas/product.schema';

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

  @ApiProperty({ example: 299 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mrp: number;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock: number;

  @ApiProperty({ minLength: 20 })
  @IsString()
  @MinLength(20)
  description: string;

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
}
