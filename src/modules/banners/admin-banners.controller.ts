import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  PartialType,
} from '@nestjs/swagger'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

import { Banner, BannerDocument } from './schemas/banner.schema'
import { Roles } from '../../common/decorators/roles.decorator'
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe'

export class BannerItemDto {
  @ApiPropertyOptional({ example: 'Slide 1' })
  @IsString()
  @IsOptional()
  title?: string

  @ApiPropertyOptional({ example: '/uploads/2024/01/slide-1.jpg' })
  @IsString()
  @IsOptional()
  image?: string

  @ApiPropertyOptional({ example: '/products?tag=deal' })
  @IsString()
  @IsOptional()
  href?: string
}

export class CreateBannerDto {
  @ApiProperty({ example: 'Summer Sale' })
  @IsString()
  title: string

  @ApiPropertyOptional({ example: 'carousel', enum: ['static', 'carousel'] })
  @IsIn(['static', 'carousel'])
  @IsOptional()
  type?: string

  @ApiPropertyOptional({ example: 'hero', enum: ['hero', 'bundle'] })
  @IsIn(['hero', 'bundle'])
  @IsOptional()
  placement?: string

  @ApiPropertyOptional({ type: [BannerItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BannerItemDto)
  @IsOptional()
  items?: BannerItemDto[]

  @ApiPropertyOptional({ example: 'Get 50% off on select items' })
  @IsString()
  @IsOptional()
  subtitle?: string

  @ApiPropertyOptional({ example: 'Shop Now' })
  @IsString()
  @IsOptional()
  cta?: string

  @ApiPropertyOptional({ example: '/products/summer-sale' })
  @IsString()
  @IsOptional()
  href?: string

  @ApiPropertyOptional({ example: '/uploads/2024/01/banner-123.jpg' })
  @IsString()
  @IsOptional()
  image?: string

  @ApiPropertyOptional({ example: 'bg-gradient-to-r from-orange-400 to-orange-600' })
  @IsString()
  @IsOptional()
  tone?: string

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  sortOrder?: number

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean
}

export class UpdateBannerDto extends PartialType(CreateBannerDto) {}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/banners')
export class AdminBannersController {
  constructor(
    @InjectModel(Banner.name) private readonly bannerModel: Model<BannerDocument>,
  ) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List all banners (admin)' })
  async list() {
    return this.bannerModel.find().sort({ sortOrder: 1 }).exec()
  }

  @Post()
  @Roles('admin')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new banner' })
  async create(@Body() dto: CreateBannerDto) {
    return this.bannerModel.create(dto)
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update a banner' })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateBannerDto,
  ) {
    const banner = await this.bannerModel.findByIdAndUpdate(id, dto, { new: true }).exec()
    if (!banner) throw new NotFoundException(`Banner ${id} not found`)
    return banner
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a banner' })
  async delete(@Param('id', ParseObjectIdPipe) id: string) {
    const result = await this.bannerModel.findByIdAndDelete(id).exec()
    if (!result) throw new NotFoundException(`Banner ${id} not found`)
  }
}
