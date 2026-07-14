import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile' }) phone?: string;
}

class ChangePasswordDto {
  @ApiProperty() @IsString() @MinLength(6) currentPassword: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) newPassword: string;
}

@ApiTags('account')
@ApiBearerAuth()
@Controller('users/me')
export class MeController {
  constructor(
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Patch()
  @ApiOperation({ summary: 'Update my profile (name / email / phone)' })
  async update(@CurrentUser('sub') userId: string, @Body() dto: UpdateProfileDto) {
    const user = await this.usersService.findByIdOrFail(userId);

    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const taken = await this.usersService.findByEmail(dto.email);
      if (taken) throw new ConflictException('This email is already in use');
      user.email = dto.email.toLowerCase();
    }
    if (dto.name) user.name = dto.name;
    if (dto.phone && dto.phone !== user.phone) {
      user.phone = dto.phone;
      user.phoneVerified = false; // re-verify after change
    }
    return user.save();
  }

  @Post('change-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Change my password (requires current password)' })
  async changePassword(@CurrentUser('sub') userId: string, @Body() dto: ChangePasswordDto) {
    const user = await this.usersService.findByIdOrFail(userId);
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    const rounds = this.config.get<number>('security.bcryptRounds') ?? 12;
    user.passwordHash = await bcrypt.hash(dto.newPassword, rounds);
    await user.save();
    return { message: 'Password updated' };
  }
}
