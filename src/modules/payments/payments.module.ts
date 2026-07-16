import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentIntent, PaymentIntentSchema } from './schemas/payment-intent.schema';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { CouponsModule } from '../coupons/coupons.module';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentIntent.name, schema: PaymentIntentSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    CouponsModule,
    forwardRef(() => UsersModule),
    MailModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
