import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? './uploads';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const storage = diskStorage({
  destination: (_req, _file, cb) => {
    const now = new Date();
    const dir = join(UPLOAD_ROOT, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
});

const imageUpload = FileInterceptor('file', {
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(new BadRequestException('Only JPG, PNG or WebP images are allowed'), false);
    }
    cb(null, true);
  },
});

const toUrl = (path: string) => '/' + path.replace(/\\/g, '/').replace(/^\.?\/?/, '');

class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{10}$/, { message: 'phone must be a valid 10-digit mobile' }) phone?: string;
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

  @Post('avatar')
  @UseInterceptors(imageUpload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload my avatar (jpg/png/webp, ≤5 MB) → updated user' })
  async uploadAvatar(@CurrentUser('sub') userId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const user = await this.usersService.findByIdOrFail(userId);
    user.avatar = toUrl(file.path);
    return user.save();
  }
}
