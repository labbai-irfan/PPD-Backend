import {
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Global,
  Injectable,
  Module,
  NestInterceptor,
  Query,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination-query.dto';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ default: '' }) actorId: string;
  @Prop({ default: '' }) actorEmail: string;
  @Prop({ required: true }) action: string; // e.g. "POST /admin/products"
  @Prop({ default: '' }) target: string; // path param id when present
  @Prop({ default: 200 }) statusCode: number;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });

/** Records every mutating /admin request (POST/PATCH/PUT/DELETE). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLogDocument>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const isAdminMutation =
      req.url.includes('/admin/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);

    if (!isAdminMutation) return next.handle();

    return next.handle().pipe(
      tap(() => {
        void this.auditModel.create({
          actorId: req.user?.sub ?? '',
          actorEmail: req.user?.email ?? '',
          action: `${req.method} ${req.url.split('?')[0]}`,
          target: (req.params as Record<string, string>)?.id ?? '',
          statusCode: context.switchToHttp().getResponse<{ statusCode: number }>().statusCode,
        });
      }),
    );
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('admin/audit-logs')
export class AuditLogsController {
  constructor(@InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLogDocument>) {}

  @Get()
  @ApiOperation({ summary: 'Admin action history (newest first)' })
  async list(@Query() query: PaginationQueryDto) {
    const [items, total] = await Promise.all([
      this.auditModel.find().sort({ createdAt: -1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).exec(),
      this.auditModel.countDocuments(),
    ]);
    return paginate(items, total, query.page, query.pageSize);
  }
}

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }])],
  controllers: [AuditLogsController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [MongooseModule],
})
export class AuditModule {}
