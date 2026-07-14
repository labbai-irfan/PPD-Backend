import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OtpPurpose = 'phone-verify' | 'password-reset' | 'admin-password-reset';

export type OtpTokenDocument = HydratedDocument<OtpToken>;

/** Short-lived verification codes: phone OTPs and password-reset tokens. */
@Schema({ timestamps: true })
export class OtpToken {
  /** Phone number or email, depending on purpose. */
  @Prop({ required: true })
  identifier: string;

  @Prop({ type: String, enum: ['phone-verify', 'password-reset', 'admin-password-reset'], required: true })
  purpose: OtpPurpose;

  @Prop({ required: true })
  codeHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: () => new Date() })
  lastSentAt: Date;
}

export const OtpTokenSchema = SchemaFactory.createForClass(OtpToken);

OtpTokenSchema.index({ identifier: 1, purpose: 1 });
OtpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
