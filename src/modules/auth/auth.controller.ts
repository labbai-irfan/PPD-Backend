import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  Headers,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  SendOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a customer account' })
  register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ip: string,
  ) {
    return this.authService.register(dto, { userAgent, ip });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email + password' })
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent: string, @Ip() ip: string) {
    return this.authService.login(dto, { userAgent, ip });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair (rotating)' })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ip: string,
  ) {
    return this.authService.refresh(dto.refreshToken, { userAgent, ip });
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(@CurrentUser() user: JwtPayload) {
    await this.authService.logout(user.sessionId);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user' })
  me(@CurrentUser('sub') userId: string) {
    return this.usersService.findByIdOrFail(userId);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request a password reset email (always 200)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If an account exists for this email, a reset link has been sent.' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset password using an emailed OTP' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.otp, dto.password);
    return { message: 'Password updated. Please log in again.' };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('send-otp')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a 6-digit OTP to a phone (dev: logged to console)' })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.phone);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-otp')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify a phone OTP' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.phone, dto.otp);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions (devices)' })
  sessions(@CurrentUser() user: JwtPayload) {
    return this.authService.listSessions(user.sub, user.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke one session' })
  async revokeSession(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    await this.authService.revokeSession(userId, id);
  }

  @Delete('sessions')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all other sessions' })
  async revokeOthers(@CurrentUser() user: JwtPayload) {
    await this.authService.revokeOtherSessions(user.sub, user.sessionId);
  }
}
