import { Controller, Get, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { Roles } from '../../common/decorators/roles.decorator';

const LOW_STOCK_THRESHOLD = 10;

@ApiTags('admin')
@ApiBearerAuth()
@Roles('moderator')
@Controller('admin/dashboard')
export class DashboardController {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'KPIs, recent orders and alerts' })
  async overview() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [revenueAgg, monthRevenueAgg, orderCount, monthOrders, orderStatuses, productCount, lowStock, userCount, pendingReviews, recentOrders] =
      await Promise.all([
        this.orderModel.aggregate<{ total: number }>([
          { $match: { status: 'delivered' } },
          { $group: { _id: null, total: { $sum: '$pricing.total' } } },
        ]),
        this.orderModel.aggregate<{ total: number }>([
          { $match: { status: 'delivered', createdAt: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: '$pricing.total' } } },
        ]),
        this.orderModel.countDocuments(),
        this.orderModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
        this.orderModel.aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        this.productModel.countDocuments(),
        this.productModel
          .find({ stock: { $lt: LOW_STOCK_THRESHOLD }, isActive: true })
          .select('title stock')
          .limit(5)
          .exec(),
        this.userModel.countDocuments({ role: 'customer', status: 'active' }),
        this.reviewModel.countDocuments({ status: 'pending' }),
        this.orderModel.find().sort({ createdAt: -1 }).limit(5).select('orderNumber customerName pricing.total status createdAt').exec(),
      ]);

    const alerts: { type: 'warning' | 'error' | 'info'; message: string }[] = [];
    for (const p of lowStock) {
      alerts.push({ type: 'warning', message: `Low stock: "${p.title}" has ${p.stock} left` });
    }
    if (pendingReviews > 0) {
      alerts.push({ type: 'info', message: `${pendingReviews} review(s) waiting for moderation` });
    }

    return {
      revenue: { total: revenueAgg[0]?.total ?? 0, thisMonth: monthRevenueAgg[0]?.total ?? 0 },
      orders: { 
        total: orderCount, 
        thisMonth: monthOrders,
        placed: orderStatuses.find(s => s._id === 'placed')?.count || 0,
        delivered: orderStatuses.find(s => s._id === 'delivered')?.count || 0,
        cancelled: orderStatuses.find(s => s._id === 'cancelled')?.count || 0,
      },
      products: { total: productCount, lowStock: lowStock.length },
      users: { total: userCount },
      pendingReviews,
      recentOrders,
      alerts,
    };
  }
}

@Module({
  imports: [OrdersModule, ProductsModule, UsersModule, ReviewsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
