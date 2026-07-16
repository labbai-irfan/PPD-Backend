import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  /**
   * Get recommendations (public - for unauthenticated users or as fallback).
   * Returns trending products based on sales quantity.
   */
  @Get('trending')
  @Public()
  @ApiOperation({
    summary: 'Get trending recommendations (by sales quantity)',
    description: 'Returns top products based on sales count. Works for all users.',
  })
  async getTrending(@Query() query: RecommendationQueryDto) {
    return this.recommendationsService.getTrendingRecommendations(query.limit);
  }

  /**
   * Get personalized recommendations for authenticated user.
   * If user has no purchase history, returns trending products.
   * If user has purchase history, returns top products from their favorite categories.
   */
  @Get('for-me')
  @ApiOperation({
    summary: 'Get personalized recommendations for current user',
    description:
      'Returns personalized recommendations based on purchase history. ' +
      'If no purchase history, returns trending products. Requires authentication.',
  })
  async getForCurrentUser(
    @CurrentUser() user: any,
    @Query() query: RecommendationQueryDto,
  ) {
    if (!user || !user._id) {
      return this.recommendationsService.getTrendingRecommendations(query.limit);
    }

    return this.recommendationsService.getPersonalizedRecommendations(user._id, query.limit);
  }

  /**
   * Get recommendations metadata for current user.
   * Shows purchase history status and favorite categories.
   */
  @Get('stats')
  @ApiOperation({
    summary: 'Get recommendation statistics for current user',
    description: 'Returns info about user purchase history and favorite categories.',
  })
  async getStats(@CurrentUser() user: any) {
    return this.recommendationsService.getRecommendationStats(user?._id);
  }

  /**
   * Get recommendations for a specific category.
   * Can optionally exclude a product.
   */
  @Get('by-category/:category')
  @Public()
  @ApiOperation({
    summary: 'Get recommendations for a specific category',
    description: 'Returns top-rated products from the specified category.',
  })
  @ApiQuery({ name: 'exclude', required: false, description: 'Product ID to exclude from results' })
  async getByCategory(
    @Param('category') category: string,
    @Query('exclude') excludeId?: string,
    @Query() query?: Partial<RecommendationQueryDto>,
  ) {
    const limit = query?.limit || 10;
    return this.recommendationsService.getRecommendationsByCategory(
      category,
      excludeId,
      limit,
    );
  }

  /**
   * Smart recommendation endpoint that auto-selects strategy.
   * For authenticated users: uses personalized logic
   * For unauthenticated users: uses trending logic
   */
  @Get()
  @Public()
  @ApiOperation({
    summary: 'Smart recommendations (auto-select strategy)',
    description:
      'Automatically selects best recommendation strategy based on user auth status and purchase history. ' +
      'For authenticated users with purchase history: personalized. Otherwise: trending.',
  })
  async getSmartRecommendations(
    @CurrentUser() user: any,
    @Query() query: RecommendationQueryDto,
  ) {
    if (!user || !user._id) {
      return this.recommendationsService.getTrendingRecommendations(query.limit);
    }

    const hasPurchaseHistory = await this.recommendationsService.hasUserPurchaseHistory(
      user._id,
    );

    if (!hasPurchaseHistory) {
      return this.recommendationsService.getTrendingRecommendations(query.limit);
    }

    return this.recommendationsService.getPersonalizedRecommendations(user._id, query.limit);
  }
}
