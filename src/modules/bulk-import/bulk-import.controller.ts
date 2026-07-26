import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFiles,
  Logger,
  BadRequestException,
  Res,
  Body,
  Query,
} from '@nestjs/common';
import type { Response } from 'express';
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
  async downloadTemplate(@Res() res: Response) {
    const csv = await this.bulkImportService.generateCsvTemplate();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bulk-import-template.csv');
    return res.send(csv);
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
      overview: 'Easily upload multiple products at once. You can upload a spreadsheet (CSV) with product details, and optionally a ZIP file containing the product images.',
      csv_format: {
        required_columns: ['Product Name (title)', 'Brand Name (brand)', 'Category (category)', 'Unit Price (price)', 'Original Price/MRP (mrp)', 'Stock Count (stock)'],
        optional_columns: [
          'Short Description (shortDescription)',
          'Description (description)',
          'ISBN (isbn)',
          'HSN Code (hsnCode)',
          'Discount Percent (discountPercent)',
          'GST Percent (gstPercent)',
          'Weight (weightPerUnit)',
          'Weight Unit (weightUnit - kg, g, mg, ml, l, pcs, pack, box, set)',
          'Featured Product (isFeatured - true/false)',
          'Is PPD Original (isPpdOriginal - true/false)',
          'Free Delivery (isFreeDelivery - true/false)',
          'Free Delivery Threshold (freeDeliveryThreshold)',
          'Specifications (specs - Format: Label: Value; Label: Value)',
          'FAQs (faqs - Format: Question: Answer; Question: Answer)',
        ],
        data_types: {
          title: 'Product Name (e.g. Steel Sipper Bottle)',
          brand: 'Brand Name (e.g. Milton)',
          category: 'Category (e.g. Kitchen Utilities - matches existing categories by name or slug)',
          price: 'Unit Price (must be a number, e.g. 349)',
          mrp: 'Original Price / MRP (must be a number, e.g. 499)',
          stock: 'Available Inventory Count (number, e.g. 50)',
          description: 'Detailed description of the product',
          isbn: 'ISBN / Unique product code (e.g. 9783161484100)',
          specs: 'Semicolon-separated label-value pairs (e.g. Capacity: 750ml; Material: Stainless Steel)',
          faqs: 'Semicolon-separated question-answer pairs (e.g. Is it leakproof?: Yes; Warranty?: 2 years)',
        },
      },
      images_format: {
        format: 'A ZIP folder containing your product images',
        naming_convention: [
          'For a single image: Name it exactly the same as the Product Name (e.g., Steel Sipper Bottle.jpg)',
          'For multiple images: Add numbers at the end (e.g., Steel Sipper Bottle_1.jpg, Steel Sipper Bottle_2.jpg or Steel Sipper Bottle1.jpg, Steel Sipper Bottle2.jpg)',
        ],
        supported_formats: ['JPG', 'JPEG', 'PNG', 'WEBP'],
        max_file_size: '10MB per image',
        important_notes: [
          'Image file names must match the Product Name in your spreadsheet exactly.',
          'Images that do not match any products in the spreadsheet will be skipped.',
          'Uploading images is optional – you can import just the spreadsheet and add images later.',
        ],
      },
      workflow: [
        'Download the template: Click the "Download Sample CSV" button.',
        'Enter product details: Fill in your product details in the downloaded spreadsheet.',
        'Name your images: Put images in a folder named after their respective products and compress it into a ZIP file.',
        'Upload your files: Select or drag both files into the upload boxes below.',
        'Review and import: Run the automatic validation, fix any errors, and import the products!',
      ],
      example_structure: {
        csv_row:
          'Steel Sipper Water Bottle 750ml | Milton | Kitchen Utilities | 349 | 499 | 50 | ...',
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
    @Body() body?: { autoCreateBrands?: string; autoCreateTags?: string; dryRun?: string },
    @Query('dryRun') dryRunQuery?: string,
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
      const autoCreateBrands = body?.autoCreateBrands !== 'false';
      const autoCreateTags = body?.autoCreateTags !== 'false';
      const isDryRun = dryRunQuery === 'true' || body?.dryRun === 'true';
      const result = await this.bulkImportService.importProducts(rows, imageMap, autoCreateBrands, autoCreateTags, isDryRun);

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
