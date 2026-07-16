import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtPayload } from '../../../common/decorators/current-user.decorator';
import { Session, SessionDocument } from '../schemas/session.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Check if the session has been revoked (e.g., via logout).
    // If revokedAt is not null, the session was explicitly terminated.
    const session = await this.sessionModel
      .findById(payload.sessionId)
      .select('revokedAt')
      .exec();

    if (!session || session.revokedAt !== null) {
      throw new UnauthorizedException('Session revoked or expired');
    }

    return payload;
  }
}
