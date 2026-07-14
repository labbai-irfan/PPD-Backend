import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

import { Review, ReviewSchema } from './schemas/review.schema';
import { ReviewsService } from './reviews.service';
import { ProductsModule } from '../products/products.module';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

class AdminReviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected'] })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';
}

class CreateReviewDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @MinLength(5)
  title: string;

  @IsString()
  @MinLength(20)
  body: string;
}

@ApiTags('catalog')
@Controller('reviews')
class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Get('product/:productId')
  @ApiOperation({ summary: 'Approved reviews for a product' })
  forProduct(
    @Param('productId', ParseObjectIdPipe) productId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.reviewsService.listForProduct(String(productId), query.page, query.pageSize);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Write a review (enters moderation as pending)' })
  async create(@CurrentUser('sub') userId: string, @Body() dto: CreateReviewDto) {
    const user = await this.usersService.findByIdOrFail(userId);
    // Verified purchase = a delivered order containing this product
    const delivered = await this.orderModel.exists({
      userId: user._id,
      status: 'delivered',
      'items.productId': new Types.ObjectId(dto.productId),
    });
    return this.reviewsService.createOrUpdate(userId, user.name, dto, !!delivered);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My reviews (all statuses)' })
  mine(@CurrentUser('sub') userId: string) {
    return this.reviewsService.listMine(userId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete my review' })
  async removeMine(@CurrentUser('sub') userId: string, @Param('id', ParseObjectIdPipe) id: string) {
    await this.reviewsService.removeOwn(userId, String(id));
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('moderator')
@Controller('admin/reviews')
class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'All reviews with moderation status + pendingCount' })
  list(@Query() query: AdminReviewQueryDto) {
    return this.reviewsService.adminList(query);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a review (recomputes product rating)' })
  approve(@Param('id', ParseObjectIdPipe) id: string) {
    return this.reviewsService.setStatus(String(id), 'approved');
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a review' })
  reject(@Param('id', ParseObjectIdPipe) id: string) {
    return this.reviewsService.setStatus(String(id), 'rejected');
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a review' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    await this.reviewsService.remove(String(id));
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Review.name, schema: ReviewSchema }]),
    ProductsModule,
    OrdersModule,
    UsersModule,
  ],
  controllers: [ReviewsController, AdminReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService, MongooseModule],
})
export class ReviewsModule {}
