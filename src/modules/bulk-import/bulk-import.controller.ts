import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFiles,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiConsumes, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { BulkImportService, BulkImportResult } from './bulk-import.service';

@ApiTags('admin / bulk-import')
@ApiBearerAuth()
@Roles('admin', 'super_admin')
@Controller('admin/bulk-import')
export class BulkImportController {
  private readonly logger = new Logger(BulkImportController.name);

  constructor(private readonly bulkImportService: BulkImportService) {}

  /**
   * Download CSV template
   */
  @Get('template')
  @ApiOperation({
    summary: 'Download CSV template',
    description:
      'Download a pre-filled CSV template with example products. Use this as a starting point for bulk import.',
  })
  @ApiResponse({
    status: 200,
    description: 'CSV template file',
    content: { 'text/csv': { schema: { type: 'string' } } },
  })
  async downloadTemplate() {
    const csv = this.bulkImportService.generateCsvTemplate();
    return {
      filename: 'bulk-import-template.csv',
      content: csv,
      mimeType: 'text/csv',
    };
  }

  /**
   * Get import instructions
   */
  @Get('instructions')
  @ApiOperation({
    summary: 'Get bulk import instructions',
    description: 'Detailed instructions on how to prepare CSV and ZIP files for bulk import.',
  })
  @ApiResponse({
    status: 200,
    description: 'Import instructions',
  })
  async getInstructions() {
    return {
      overview: 'Two-file bulk import system: CSV for product data + ZIP for images',
      csv_format: {
        required_columns: ['title', 'brand', 'category', 'price', 'mrp', 'stock'],
        optional_columns: [
          'description',
          'tags',
          'highlights',
          'deliveryDays',
          'returnDays',
          'isPpdOriginal',
          'isFreeDelivery',
        ],
        data_types: {
          title: 'string (max 200 chars)',
          brand: 'string',
          category: 'string (must exist in system)',
          price: 'number (positive, <= mrp)',
          mrp: 'number (positive)',
          stock: 'number (>= 0)',
          description: 'string (max 1000 chars)',
          tags: 'comma-separated (featured,deal,new,bestseller,trending)',
          highlights: 'semicolon-separated (Feature 1;Feature 2)',
          deliveryDays: 'number (default: 2)',
          returnDays: 'number (default: 7)',
        },
      },
      images_format: {
        format: 'ZIP file containing product images',
        naming_convention: [
          'Single image: ProductTitle.jpg',
          'Multiple images: ProductTitle_1.jpg, ProductTitle_2.jpg, ProductTitle_3.jpg',
          'Or: ProductTitle1.jpg, ProductTitle2.jpg, ProductTitle3.jpg',
        ],
        supported_formats: ['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'BMP'],
        max_file_size: '10MB per image',
        important_notes: [
          'Product name in filename must EXACTLY match CSV title',
          'Images without matching products will be skipped',
          'ZIP file is optional - can upload CSV-only',
        ],
      },
      workflow: [
        '1. Download template: GET /admin/bulk-import/template',
        '2. Fill product data in CSV',
        '3. Prepare images in ZIP (organized by product name)',
        '4. Upload both files: POST /admin/bulk-import/import',
        '5. Check results for success/failure details',
      ],
      example_structure: {
        csv_row:
          'Steel Sipper Water Bottle 750ml | Classmate | home-kitchen | 349 | 499 | 50 | ...',
        zip_contents: [
          'Steel Sipper Water Bottle 750ml.jpg',
          'Steel Sipper Water Bottle 750ml_1.jpg',
          'Steel Sipper Water Bottle 750ml_2.jpg',
        ],
      },
    };
  }

  /**
   * Import products with images
   */
  @Post('import')
  @UseInterceptors(FilesInterceptor('files', 2))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Bulk import products',
    description:
      'Upload CSV file with product data and optional ZIP file with images. ' +
      'Images must be named matching product titles in CSV.',
  })
  @ApiResponse({
    status: 200,
    description: 'Import result with summary and per-product status',
  })
  async importProducts(
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<BulkImportResult> {
    const MAX_CSV_SIZE = 10 * 1024 * 1024; // 10 MB
    const MAX_ZIP_SIZE = 100 * 1024 * 1024; // 100 MB

    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    // Find CSV and ZIP files
    let csvFile: Express.Multer.File | null = null;
    let zipFile: Express.Multer.File | null = null;

    for (const file of files) {
      if (
        file.mimetype === 'text/csv' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.csv')
      ) {
        csvFile = file;
      } else if (
        file.mimetype === 'application/zip' ||
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.endsWith('.zip')
      ) {
        zipFile = file;
      }
    }

    if (!csvFile) {
      throw new BadRequestException('CSV file is required');
    }

    // Validate file sizes
    if (csvFile.size > MAX_CSV_SIZE) {
      throw new BadRequestException(`CSV file exceeds maximum size of 10 MB (got ${(csvFile.size / 1024 / 1024).toFixed(2)} MB)`);
    }

    if (zipFile && zipFile.size > MAX_ZIP_SIZE) {
      throw new BadRequestException(`ZIP file exceeds maximum size of 100 MB (got ${(zipFile.size / 1024 / 1024).toFixed(2)} MB)`);
    }

    this.logger.log(
      `Starting bulk import: CSV (${csvFile.size} bytes)${zipFile ? ` + ZIP (${zipFile.size} bytes)` : ''}`,
    );

    try {
      // Parse CSV
      const rows = await this.bulkImportService.parseCsv(csvFile.buffer);
      this.logger.log(`Parsed ${rows.length} products from CSV`);

      // Extract images from ZIP if provided
      let imageMap = new Map<string, string[]>();
      if (zipFile) {
        imageMap = await this.bulkImportService.extractImagesFromZip(zipFile.buffer);
        this.logger.log(`Extracted images for ${imageMap.size} products from ZIP`);
      }

      // Import products
      const result = await this.bulkImportService.importProducts(rows, imageMap);

      this.logger.log(
        `Import result: ${result.status.toUpperCase()} - ` +
          `${result.summary.successCount} created/updated, ${result.summary.failedCount} failed`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Bulk import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Get import history/stats
   */
  @Get('stats')
  @ApiOperation({
    summary: 'Get bulk import statistics',
    description:
      'Get statistics about previous bulk imports (coming soon - for monitoring)',
  })
  async getImportStats() {
    return {
      message: 'Import stats tracking coming soon',
      placeholder:
        'Track import history, success rates, and image matching metrics',
    };
  }
}
