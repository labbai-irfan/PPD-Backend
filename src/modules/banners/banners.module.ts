import { Controller, Get, Module, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Banner, BannerDocument, BannerSchema } from './schemas/banner.schema';
import {
  HomeContent,
  HomeContentDocument,
  HomeContentSchema,
} from './schemas/home-content.schema';
import { Public } from '../../common/decorators/public.decorator';
import { AdminBannersController } from './admin-banners.controller';

@ApiTags('catalog')
@Public()
@Controller()
export class BannersController {
  constructor(
    @InjectModel(Banner.name) private readonly bannerModel: Model<BannerDocument>,
    @InjectModel(HomeContent.name) private readonly homeModel: Model<HomeContentDocument>,
  ) {}

  @Get('banners')
  @ApiOperation({ summary: 'Active hero banners, sorted' })
  banners() {
    return this.bannerModel.find({ isActive: true }).sort({ sortOrder: 1 }).exec();
  }

  @Get('home')
  @ApiOperation({ summary: 'Home page content sections (singleton)' })
  async home() {
    const doc = await this.homeModel.findOne().exec();
    if (!doc) throw new NotFoundException('Home content not seeded yet');
    return doc;
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Banner.name, schema: BannerSchema },
      { name: HomeContent.name, schema: HomeContentSchema },
    ]),
  ],
  controllers: [BannersController, AdminBannersController],
  exports: [MongooseModule],
})
export class BannersModule {}
