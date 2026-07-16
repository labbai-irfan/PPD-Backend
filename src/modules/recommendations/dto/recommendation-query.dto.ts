import { IsOptional, IsNumber, Min, Max, IsIn, IsString, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RecommendationQueryDto {
  @ApiPropertyOptional({ description: 'Number of products to return', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit: number = 10;

  @ApiPropertyOptional({
    description: 'Recommendation type',
    enum: ['trending', 'personalized'],
    example: 'trending',
  })
  @IsOptional()
  @IsIn(['trending', 'personalized'])
  type: 'trending' | 'personalized' = 'trending';
}

export class CategoryRecommendationQueryDto {
  @ApiPropertyOptional({ description: 'Product ID to exclude', example: 'objectId' })
  @IsOptional()
  @IsString()
  exclude?: string;

  @ApiPropertyOptional({ description: 'Number of products to return', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit: number = 10;
}
