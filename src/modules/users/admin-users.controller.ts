import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

import { User, UserDocument } from './schemas/user.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { generateReferralCode } from '../../common/utils';
import { MailService } from '../mail/mail.service';

class AdminUserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ['active', 'banned'] })
  @IsOptional()
  @IsIn(['active', 'banned'])
  status?: 'active' | 'banned';
}

class CreateAdminDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ enum: ['moderator', 'admin', 'super_admin'] })
  @IsIn(['moderator', 'admin', 'super_admin'])
  role: 'moderator' | 'admin' | 'super_admin';

  @ApiProperty({ minLength: 8, description: 'Temporary password (share securely)' })
  @IsString()
  @MinLength(8)
  password: string;
}

class UpdateAdminRoleDto {
  @ApiProperty({ enum: ['moderator', 'admin', 'super_admin'] })
  @IsIn(['moderator', 'admin', 'super_admin'])
  role: 'moderator' | 'admin' | 'super_admin';
}

/** Customer management (ban / unban / delete / order counts). */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('moderator')
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Customers with order counts (search + status filter)' })
  async list(@Query() query: AdminUserQueryDto) {
    const filter: Record<string, unknown> = { role: 'customer' };
    if (query.status) filter.status = query.status;
    if (query.q) {
      const rx = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const [users, total] = await Promise.all([
      this.userModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).exec(),
      this.userModel.countDocuments(filter),
    ]);

    const counts = await this.orderModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { userId: { $in: users.map((u) => u._id) } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    const countByUser = new Map(counts.map((c) => [c._id.toHexString(), c.count]));

    const items = users.map((u) => ({
      ...u.toObject(),
      orders: countByUser.get(u._id.toHexString()) ?? 0,
    }));
    return paginate(items, total, query.page, query.pageSize);
  }

  @Post(':id/ban')
  @Roles('admin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ban a customer (blocks login)' })
  ban(@Param('id', ParseObjectIdPipe) id: string) {
    return this.setStatus(String(id), 'banned');
  }

  @Post(':id/unban')
  @Roles('admin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unban a customer' })
  unban(@Param('id', ParseObjectIdPipe) id: string) {
    return this.setStatus(String(id), 'active');
  }

  @Delete(':id')
  @Roles('super_admin')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete (anonymize) a customer — orders are kept' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    const user = await this.userModel.findById(String(id)).exec();
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'customer') throw new BadRequestException('Use /admin/admins for staff accounts');

    // Anonymize instead of hard-delete so order history stays intact
    user.name = 'Deleted User';
    user.email = `deleted-${user._id.toHexString()}@removed.local`;
    user.phone = undefined;
    user.status = 'banned';
    user.passwordHash = 'deleted';
    await user.save();
  }

  private async setStatus(id: string, status: 'active' | 'banned') {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'customer') throw new BadRequestException('Cannot ban staff accounts here');
    user.status = status;
    return user.save();
  }
}

/** Staff account management — super_admin only. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('admin/admins')
export class AdminsController {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'All staff accounts (moderator and up)' })
  list() {
    return this.userModel
      .find({ role: { $in: ['moderator', 'admin', 'super_admin'] } })
      .sort({ createdAt: 1 })
      .exec();
  }

  @Post()
  @ApiOperation({ summary: 'Create a staff account (invite email sent)' })
  async create(@Body() dto: CreateAdminDto) {
    const exists = await this.userModel.findOne({ email: dto.email.toLowerCase() }).exec();
    if (exists) throw new ConflictException('An account with this email already exists');

    const rounds = this.config.get<number>('security.bcryptRounds') ?? 12;
    const user = await this.userModel.create({
      name: dto.name,
      email: dto.email,
      passwordHash: await bcrypt.hash(dto.password, rounds),
      role: dto.role,
      referralCode: generateReferralCode(),
    });

    void this.mail.send({
      to: user.email,
      subject: 'You have been added as PPD Store staff',
      text: `Hi ${user.name},\n\nAn administrator account (${dto.role}) was created for you.\nLogin at the admin portal with your email and the temporary password you were given, then change it immediately.`,
    });
    return user;
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Change a staff role (protected account immune)' })
  async updateRole(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateAdminRoleDto) {
    const user = await this.findStaff(String(id));
    if (user.isProtected) throw new BadRequestException('The primary admin account cannot be modified');
    user.role = dto.role;
    return user.save();
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a staff account (demotes to customer)' })
  async remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('sub') actorId: string,
  ) {
    const user = await this.findStaff(String(id));
    if (user.isProtected) throw new BadRequestException('The primary admin account cannot be removed');
    if (user._id.toHexString() === actorId) throw new BadRequestException('You cannot remove yourself');
    user.role = 'customer';
    await user.save();
  }

  private async findStaff(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user || user.role === 'customer') throw new NotFoundException('Staff account not found');
    return user;
  }
}
