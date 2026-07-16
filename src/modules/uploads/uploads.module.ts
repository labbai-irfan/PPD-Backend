import {
  BadRequestException,
  Controller,
  Module,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { UsersModule } from '../users/users.module';

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? './uploads';
const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB ?? '5', 10);
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const storage = diskStorage({
  destination: (_req, _file, cb) => {
    const now = new Date();
    const dir = join(
      UPLOAD_ROOT,
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
    );
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) =>
    cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
});

const imageUpload = FileInterceptor('file', {
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(
        new BadRequestException(
          'Only JPG, PNG or WebP images are allowed',
        ),
        false,
      );
    }
    cb(null, true);
  },
});

const toUrl = (path: string) =>
  '/' + path.replace(/\\/g, '/').replace(/^\.?\/?/, '');

@ApiTags('admin')
@ApiBearerAuth()
@Controller()
export class UploadsController {
  constructor(private readonly usersService: UsersService) {}

  @Post('admin/uploads/image')
  @Roles('admin')
  @UseInterceptors(imageUpload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload a product image (jpg/png/webp, ≤5 MB)' })
  uploadImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return { url: toUrl(file.path) };
  }

  @Post('users/me/avatar')
  @UseInterceptors(imageUpload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload my avatar → updated user' })
  async uploadAvatar(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const user = await this.usersService.findByIdOrFail(userId);
    user.avatar = toUrl(file.path);
    return user.save();
  }
}

@Module({
  imports: [UsersModule],
  controllers: [UploadsController],
})
export class UploadsModule {}

