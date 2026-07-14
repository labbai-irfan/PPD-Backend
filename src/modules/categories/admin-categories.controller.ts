import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IsOptional, IsString, MinLength } from 'class-validator';

import { Category, CategoryDocument } from './schemas/category.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { slugify } from '../../common/utils';

class CreateCategoryDto {
  @ApiProperty({ example: 'Art Supplies' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ description: 'Material Symbols name or emoji' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Short blurb shown on category cards' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;
}

class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a category (slug auto-generated)' })
  async create(@Body() dto: CreateCategoryDto) {
    const slug = slugify(dto.name);
    const exists = await this.categoryModel.findOne({ slug }).exec();
    if (exists) throw new ConflictException('A category with this name already exists');
    const maxSort = await this.categoryModel.findOne().sort({ sortOrder: -1 }).select('sortOrder').exec();
    return this.categoryModel.create({
      ...dto,
      slug,
      icon: dto.icon ?? '📦',
      sortOrder: (maxSort?.sortOrder ?? 0) + 1,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category (renaming keeps the slug, so products stay linked)' })
  async update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateCategoryDto) {
    const category = await this.categoryModel.findById(String(id)).exec();
    if (!category) throw new NotFoundException('Category not found');
    Object.assign(category, dto);
    return category.save();
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a category (blocked while products use it)' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    const category = await this.categoryModel.findById(String(id)).exec();
    if (!category) throw new NotFoundException('Category not found');
    if (category.slug === 'all') throw new BadRequestException('The "All" category cannot be deleted');

    const inUse = await this.productModel.countDocuments({ category: category.slug });
    if (inUse > 0) {
      throw new BadRequestException(`Cannot delete: ${inUse} product(s) still use this category`);
    }
    await category.deleteOne();
  }
}
