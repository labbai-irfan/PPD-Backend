import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';
import { AdminUsersController, AdminsController } from './admin-users.controller';
import { MeController } from './me.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    forwardRef(() => OrdersModule),
  ],
  controllers: [AdminUsersController, AdminsController, MeController],
  providers: [UsersService],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
