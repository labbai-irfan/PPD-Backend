import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PRODUCT_TAGS } from '../schemas/product.schema';

export const SORT_OPTIONS = [
  'relevance',
  'price-asc',
  'price-desc',
  'rating',
  'newest',
  'discount',
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Category slug ("all" = no filter)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Search text (title/brand/description)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: SORT_OPTIONS, default: 'relevance' })
  @IsOptional()
  @IsIn(SORT_OPTIONS)
  sort: SortOption = 'relevance';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ description: 'Comma-separated brand names', type: String })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  brands?: string[];

  @ApiPropertyOptional({ enum: PRODUCT_TAGS })
  @IsOptional()
  @IsIn(PRODUCT_TAGS)
  tag?: string;
}

export class ProductsByIdsDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}
