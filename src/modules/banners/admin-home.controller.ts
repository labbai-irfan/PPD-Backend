import { Body, Controller, Get, Patch } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

import { HomeContent, HomeContentDocument } from './schemas/home-content.schema'
import { Roles } from '../../common/decorators/roles.decorator'

export class PackageCardDto {
  @ApiPropertyOptional({ example: 'Complete Writing Kit' })
  @IsString()
  @IsOptional()
  name?: string

  @ApiPropertyOptional({ example: 'Perfect for a fresh start to the year' })
  @IsString()
  @IsOptional()
  blurb?: string

  @ApiPropertyOptional({ example: 311 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number

  @ApiPropertyOptional({ example: '/uploads/2024/01/kit.jpg' })
  @IsString()
  @IsOptional()
  image?: string

  @ApiPropertyOptional({ example: '/products/all?category=stationery' })
  @IsString()
  @IsOptional()
  href?: string
}

export class UpdateHomeContentDto {
  @ApiPropertyOptional({ type: [PackageCardDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageCardDto)
  @IsOptional()
  packages?: PackageCardDto[]
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/home')
export class AdminHomeController {
  constructor(
    @InjectModel(HomeContent.name) private readonly homeModel: Model<HomeContentDocument>,
  ) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Home content sections (admin)' })
  async get() {
    return this.homeModel.findOne().exec()
  }

  @Patch()
  @Roles('admin')
  @ApiOperation({ summary: 'Update home content sections (packages, etc.)' })
  async update(@Body() dto: UpdateHomeContentDto) {
    return this.homeModel
      .findOneAndUpdate({}, { $set: dto }, { new: true, upsert: true })
      .exec()
  }
}
