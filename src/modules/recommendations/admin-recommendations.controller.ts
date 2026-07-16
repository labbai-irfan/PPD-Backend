import { Controller, Get, Post, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DataCleanupUtils } from './utils/data-cleanup';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from '../products/schemas/product.schema';

@ApiTags('admin / recommendations')
@Controller('admin/recommendations')
@UseGuards(RolesGuard)
@Roles('admin', 'super_admin')
export class AdminRecommendationsController {
  private readonly logger = new Logger(AdminRecommendationsController.name);

  constructor(
    private readonly recommendationsService: RecommendationsService,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  /**
   * Get data quality report for products
   * Shows statistics about product data health
   */
  @Get('quality-report')
  @ApiOperation({
    summary: 'Get data quality report',
    description: 'Generates a comprehensive report on product data health and issues',
  })
  async getQualityReport() {
    this.logger.log('Generating quality report...');
    const report = await DataCleanupUtils.generateQualityReport(this.productModel);
    return {
      timestamp: new Date().toISOString(),
      ...report,
    };
  }

  /**
   * Run data cleanup on products collection
   * Fixes common data quality issues
   */
  @Post('cleanup-data')
  @ApiOperation({
    summary: 'Run data cleanup',
    description:
      'Fixes common data quality issues: invalid prices, missing fields, ' +
      'normalizes data, removes invalid products. Returns cleanup summary.',
  })
  async cleanupData() {
    this.logger.log('Starting data cleanup...');

    const result = await DataCleanupUtils.cleanupProducts(this.productModel);

    this.logger.log(
      `Cleanup complete: processed ${result.processed}, fixed ${result.fixed}, deleted ${result.deleted}`,
    );

    // Generate new report after cleanup
    const report = await DataCleanupUtils.generateQualityReport(this.productModel);

    return {
      timestamp: new Date().toISOString(),
      cleanup: result,
      reportAfterCleanup: report,
    };
  }

  /**
   * Validate a specific product by ID or slug
   */
  @Get('validate/:idOrSlug')
  @ApiOperation({
    summary: 'Validate product data',
    description: 'Validates a specific product and returns validation errors if any',
  })
  async validateProduct(idOrSlug: string) {
    const product = await this.productModel.findOne({
      $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
    });

    if (!product) {
      return { valid: false, errors: ['Product not found'] };
    }

    const validation = DataCleanupUtils.validateProduct(product);

    return {
      productId: product._id,
      productTitle: product.title,
      ...validation,
    };
  }

  /**
   * Get trending recommendations with cache info
   */
  @Get('trending-debug')
  @ApiOperation({
    summary: 'Debug trending recommendations',
    description: 'Returns trending recommendations with debug info about data filtering',
  })
  async getTrendingDebug() {
    const startTime = Date.now();
    const recommendations = await this.recommendationsService.getTrendingRecommendations(10);
    const duration = Date.now() - startTime;

    return {
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      count: recommendations.length,
      products: recommendations.map((p) => ({
        _id: p._id,
        title: p.title,
        price: p.price,
        rating: p.rating,
        salesCount: p.salesCount,
        stock: p.stock,
        images: p.images?.length || 0,
      })),
    };
  }

  /**
   * Run health check on recommendation system
   */
  @Get('health-check')
  @ApiOperation({
    summary: 'Recommendation system health check',
    description:
      'Checks if the recommendation system is working correctly. ' +
      'Tests trending, and validates data quality.',
  })
  async healthCheck() {
    const checks = {
      timestamp: new Date().toISOString(),
      checks: {
        database: 'pending',
        trending: 'pending',
        dataQuality: 'pending',
      },
      errors: [] as string[],
    };

    try {
      // Check database connection
      const count = await this.productModel.countDocuments({});
      checks.checks.database = `OK (${count} products)`;
    } catch (error) {
      checks.checks.database = 'FAILED';
      checks.errors.push(`Database: ${error.message}`);
    }

    try {
      // Check trending endpoint
      const trending = await this.recommendationsService.getTrendingRecommendations(5);
      checks.checks.trending = `OK (${trending.length}/5 products)`;
      if (trending.length < 5) {
        checks.errors.push('Trending: Less than 5 products available');
      }
    } catch (error) {
      checks.checks.trending = 'FAILED';
      checks.errors.push(`Trending: ${error.message}`);
    }

    try {
      // Check data quality
      const report = await DataCleanupUtils.generateQualityReport(this.productModel);
      const qualityScore = (report.validProducts / report.totalProducts) * 100;
      checks.checks.dataQuality = `${qualityScore.toFixed(1)}% valid (${report.validProducts}/${report.totalProducts})`;

      if (qualityScore < 80) {
        checks.errors.push(`Data Quality: Only ${qualityScore.toFixed(1)}% valid products`);
      }

      if (report.issues.length > 0) {
        checks.errors.push(...report.issues);
      }
    } catch (error) {
      checks.checks.dataQuality = 'FAILED';
      checks.errors.push(`Data Quality: ${error.message}`);
    }

    const allOk = !checks.errors.length && Object.values(checks.checks).every((v) => v.includes('OK'));

    return {
      ...checks,
      status: allOk ? 'HEALTHY' : 'ISSUES_DETECTED',
    };
  }
}
