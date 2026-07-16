import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkImportFilesDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'CSV file with product data (required)',
  })
  csv: Express.Multer.File;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'ZIP file containing product images (optional)',
  })
  zip?: Express.Multer.File;
}

export class TemplateCsvDto {
  @ApiProperty({ description: 'CSV template as downloadable file' })
  templateUrl: string;

  @ApiProperty({ description: 'Instructions for using the template' })
  instructions: {
    required_columns: string[];
    optional_columns: string[];
    image_naming: string;
    zip_structure: string;
    examples: Record<string, string>;
  };
}
