import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { Session, SessionDocument } from './schemas/session.schema';
import { OtpToken, OtpTokenDocument } from './schemas/otp-token.schema';
import { MailService } from '../mail/mail.service';
import { generateOtp, generateReferralCode } from '../../common/utils';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { LoginDto, RegisterDto } from './dto/auth.dto';

export interface AuthResult {
  user: UserDocument;
  accessToken: string;
  refreshToken: string;
}

interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    @InjectModel(OtpToken.name) private readonly otpModel: Model<OtpTokenDocument>,
  ) {}

  // ---------- Register / Login ----------

  async register(dto: RegisterDto, meta: ClientMeta): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('An account with this email already exists');

    let referredBy: Types.ObjectId | null = null;
    if (dto.referralCode) {
      const referrer = await this.usersService.findByReferralCode(dto.referralCode);
      if (referrer) referredBy = referrer._id;
    }

    const rounds = this.config.get<number>('security.bcryptRounds') ?? 12;
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    // Retry on the (rare) referral-code collision
    let user: UserDocument | null = null;
    for (let attempt = 0; attempt < 3 && !user; attempt++) {
      try {
        user = await this.usersService.create({
          name: dto.name,
          email: dto.email,
          passwordHash,
          referralCode: generateReferralCode(),
          referredBy,
        });
      } catch (err: unknown) {
        const isDupCode =
          typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
        if (!isDupCode || attempt === 2) throw err;
      }
    }

    void this.mail.sendWelcome(user!.email, user!.name);
    return this.issueTokens(user!, meta);
  }

  async login(dto: LoginDto, meta: ClientMeta): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    if (user.status === 'banned') throw new ForbiddenException('This account has been suspended');

    this.assertNotLocked(user);

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.recordFailedAttempt(user);
      throw new UnauthorizedException('Invalid email or password');
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    return this.issueTokens(user, meta);
  }

  /** Admin portal login — same credentials, but customers are rejected. */
  async adminLogin(dto: LoginDto, meta: ClientMeta): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    // Generic error: don't leak whether the account exists or its role
    if (!user || user.role === 'customer') {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.login(dto, meta);
  }

  private assertNotLocked(user: UserDocument): void {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        `Account locked due to failed login attempts. Try again in ${minutesLeft} minute(s).`,
        HttpStatus.LOCKED,
      );
    }
  }

  private async recordFailedAttempt(user: UserDocument): Promise<void> {
    const maxAttempts = this.config.get<number>('security.loginMaxAttempts') ?? 5;
    const lockoutMinutes = this.config.get<number>('security.loginLockoutMinutes') ?? 30;

    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= maxAttempts) {
      user.lockedUntil = new Date(Date.now() + lockoutMinutes * 60_000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
  }

  // ---------- Tokens & sessions ----------

  private async issueTokens(user: UserDocument, meta: ClientMeta): Promise<AuthResult> {
    const refreshExpires = this.config.get<string>('jwt.refreshExpires') ?? '7d';
    const expiresAt = new Date(Date.now() + this.parseDuration(refreshExpires));

    const session = await this.sessionModel.create({
      userId: user._id,
      refreshTokenHash: 'pending',
      userAgent: this.describeUserAgent(meta.userAgent),
      ip: meta.ip ?? '',
      expiresAt,
    });

    const sessionId = session._id.toHexString();
    const payload: JwtPayload = {
      sub: user._id.toHexString(),
      email: user.email,
      role: user.role,
      sessionId,
    };

    const accessToken = await this.jwtService.signAsync(
      { ...payload },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: (this.config.get<string>('jwt.accessExpires') ?? '15m') as `${number}m`,
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub: payload.sub, sessionId },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpires as `${number}d`,
      },
    );

    session.refreshTokenHash = sha256(refreshToken);
    await session.save();

    return { user, accessToken, refreshToken };
  }

  async refresh(refreshToken: string, meta: ClientMeta): Promise<AuthResult> {
    let decoded: { sub: string; sessionId: string };
    try {
      decoded = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.sessionModel.findById(decoded.sessionId).exec();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.refreshTokenHash !== sha256(refreshToken)
    ) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    const user = await this.usersService.findById(decoded.sub);
    if (!user || user.status === 'banned') throw new UnauthorizedException('Account unavailable');

    // Rotate: old session is revoked, a fresh one is issued
    session.revokedAt = new Date();
    await session.save();

    return this.issueTokens(user, meta);
  }

  async logout(sessionId: string | undefined): Promise<void> {
    if (!sessionId) return;
    await this.sessionModel.updateOne(
      { _id: sessionId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.sessionModel
      .find({ userId: new Types.ObjectId(userId), revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ lastActiveAt: -1 })
      .exec();

    return sessions.map((s) => ({
      id: s._id.toHexString(),
      userAgent: s.userAgent,
      ip: s.ip,
      lastActiveAt: s.lastActiveAt,
      createdAt: (s as unknown as { createdAt: Date }).createdAt,
      current: s._id.toHexString() === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.sessionModel.updateOne(
      { _id: sessionId, userId: new Types.ObjectId(userId), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    if (result.matchedCount === 0) throw new BadRequestException('Session not found');
  }

  async revokeOtherSessions(userId: string, currentSessionId?: string): Promise<void> {
    await this.sessionModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        revokedAt: null,
        ...(currentSessionId ? { _id: { $ne: currentSessionId } } : {}),
      },
      { $set: { revokedAt: new Date() } },
    );
  }

  private async revokeAllSessions(userId: Types.ObjectId): Promise<void> {
    await this.sessionModel.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  // ---------- Forgot / reset password ----------

  async forgotPassword(email: string, isAdmin = false): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    // Always resolve successfully — no account enumeration
    if (!user) return;
    if (isAdmin && user.role === 'customer') return;

    const otp = generateOtp(6);
    const ttlMinutes = this.config.get<number>('otp.resetTokenTtlMinutes') ?? 10;
    const purpose = isAdmin ? 'admin-password-reset' : 'password-reset';

    await this.otpModel.deleteMany({ identifier: user.email, purpose });
    await this.otpModel.create({
      identifier: user.email,
      purpose,
      codeHash: sha256(otp),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    });

    await this.mail.sendPasswordResetOtp(user.email, otp);
  }

  async resetPassword(email: string, otp: string, password: string): Promise<void> {
    const codeHash = sha256(otp);
    const record = await this.otpModel
      .findOne({
        identifier: email,
        codeHash,
        purpose: { $in: ['password-reset', 'admin-password-reset'] },
        expiresAt: { $gt: new Date() },
      })
      .exec();
    if (!record) throw new BadRequestException('Reset OTP is invalid or has expired');

    const user = await this.usersService.findByEmail(record.identifier);
    if (!user) throw new BadRequestException('Reset OTP is invalid or has expired');

    const rounds = this.config.get<number>('security.bcryptRounds') ?? 12;
    user.passwordHash = await bcrypt.hash(password, rounds);
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    await this.otpModel.deleteOne({ _id: record._id });
    await this.revokeAllSessions(user._id);
  }

  // ---------- Phone OTP ----------

  async sendOtp(phone: string): Promise<{ sentAt: string; resendAfter: number }> {
    const cooldown = this.config.get<number>('otp.resendCooldownSeconds') ?? 60;
    const ttlMinutes = this.config.get<number>('otp.ttlMinutes') ?? 10;

    const existing = await this.otpModel
      .findOne({ identifier: phone, purpose: 'phone-verify' })
      .exec();
    if (existing && Date.now() - existing.lastSentAt.getTime() < cooldown * 1000) {
      const wait = Math.ceil(
        (cooldown * 1000 - (Date.now() - existing.lastSentAt.getTime())) / 1000,
      );
      throw new HttpException(`Please wait ${wait}s before requesting another OTP`, 429);
    }

    const code = generateOtp(this.config.get<number>('otp.length') ?? 6);
    await this.otpModel.deleteMany({ identifier: phone, purpose: 'phone-verify' });
    await this.otpModel.create({
      identifier: phone,
      purpose: 'phone-verify',
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      lastSentAt: new Date(),
    });

    // No SMS provider wired yet — dev mode logs the code
    this.logger.log(`[OTP] phone=${phone} code=${code}`);

    return { sentAt: new Date().toISOString(), resendAfter: cooldown };
  }

  async verifyOtp(phone: string, otp: string): Promise<{ verified: boolean }> {
    const record = await this.otpModel
      .findOne({ identifier: phone, purpose: 'phone-verify', expiresAt: { $gt: new Date() } })
      .exec();
    if (!record) throw new BadRequestException('OTP expired — request a new one');

    if (record.attempts >= 5) {
      await this.otpModel.deleteOne({ _id: record._id });
      throw new BadRequestException('Too many attempts — request a new OTP');
    }

    if (record.codeHash !== sha256(otp)) {
      record.attempts += 1;
      await record.save();
      throw new BadRequestException('Incorrect OTP');
    }

    await this.otpModel.deleteOne({ _id: record._id });

    const user = await this.usersService.findByPhone(phone);
    if (user) {
      user.phoneVerified = true;
      await user.save();
    }

    return { verified: true };
  }

  // ---------- Helpers ----------

  /** "15m" | "7d" | "12h" | "30s" -> milliseconds */
  private parseDuration(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const num = parseInt(match[1], 10);
    const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]!;
    return num * unit;
  }

  private describeUserAgent(ua?: string): string {
    if (!ua) return 'Unknown device';
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
    const device = /Mobile|Android|iPhone/.test(ua) ? 'Mobile' : 'Desktop';
    return `${device} ${browser}`;
  }
}
