import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { Session, SessionSchema } from './schemas/session.schema';
import { OtpToken, OtpTokenSchema } from './schemas/otp-token.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({}), // secrets provided per-sign in AuthService
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: OtpToken.name, schema: OtpTokenSchema },
    ]),
  ],
  controllers: [AuthController, AdminAuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
