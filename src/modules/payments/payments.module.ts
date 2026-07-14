import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentIntent, PaymentIntentSchema } from './schemas/payment-intent.schema';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentIntent.name, schema: PaymentIntentSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    CouponsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
