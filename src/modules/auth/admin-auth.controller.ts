import { Body, Controller, HttpCode, Headers, Ip, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { ForgotPasswordDto, LoginDto } from './dto/auth.dto';

@ApiTags('admin')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin portal login (customers rejected)' })
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent: string, @Ip() ip: string) {
    return this.authService.adminLogin(dto, { userAgent, ip });
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin password reset email (always 200)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email, true);
    return { message: 'If an admin account exists for this email, a reset link has been sent.' };
  }
}
