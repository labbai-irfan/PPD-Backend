import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Brand, BrandDocument, BrandSchema } from './schemas/brand.schema';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('catalog')
@Public()
@Controller('brands')
export class BrandsController {
  constructor(@InjectModel(Brand.name) private readonly brandModel: Model<BrandDocument>) {}

  @Get()
  @ApiOperation({ summary: 'All brands' })
  list() {
    return this.brandModel.find().sort({ name: 1 }).exec();
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Brand.name, schema: BrandSchema }])],
  controllers: [BrandsController],
  exports: [MongooseModule],
})
export class BrandsModule {}
