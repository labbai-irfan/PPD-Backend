import { Controller, Delete, Get, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true }) title: string;
  @Prop({ required: true }) message: string;
  @Prop({ type: String, enum: ['order', 'promo', 'system'], default: 'system' }) kind: string;
  @Prop({ default: false }) read: boolean;
  @Prop({ default: '' }) href: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

@ApiTags('account')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My notifications + unread count' })
  async list(@CurrentUser('sub') userId: string, @Query() query: PaginationQueryDto) {
    const uid = new Types.ObjectId(userId);
    const [items, total, unreadCount] = await Promise.all([
      this.notificationModel.find({ userId: uid }).sort({ createdAt: -1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).exec(),
      this.notificationModel.countDocuments({ userId: uid }),
      this.notificationModel.countDocuments({ userId: uid, read: false }),
    ]);
    return { ...paginate(items, total, query.page, query.pageSize), unreadCount };
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark one as read' })
  async markRead(@CurrentUser('sub') userId: string, @Param('id', ParseObjectIdPipe) id: string) {
    await this.notificationModel.updateOne(
      { _id: String(id), userId: new Types.ObjectId(userId) },
      { read: true },
    );
  }

  @Post('read-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark all as read' })
  async markAllRead(@CurrentUser('sub') userId: string) {
    await this.notificationModel.updateMany({ userId: new Types.ObjectId(userId), read: false }, { read: true });
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a notification' })
  async remove(@CurrentUser('sub') userId: string, @Param('id', ParseObjectIdPipe) id: string) {
    await this.notificationModel.deleteOne({ _id: String(id), userId: new Types.ObjectId(userId) });
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }])],
  controllers: [NotificationsController],
  exports: [MongooseModule],
})
export class NotificationsModule {}
