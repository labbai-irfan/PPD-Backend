import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

/** One document per login (device). Powers refresh rotation + device management. */
@Schema({ timestamps: true })
export class Session {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  refreshTokenHash: string;

  @Prop({ default: 'Unknown device' })
  userAgent: string;

  @Prop({ default: '' })
  ip: string;

  @Prop({ default: () => new Date() })
  lastActiveAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// Mongo removes the doc once expiresAt passes
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
