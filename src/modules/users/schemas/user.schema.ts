import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserRole = 'customer' | 'moderator' | 'admin' | 'super_admin';
export type UserStatus = 'active' | 'banned';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop()
  phone?: string;

  @Prop({ default: false })
  phoneVerified: boolean;

  @Prop()
  avatar?: string;

  @Prop({ type: String, enum: ['student', 'parent'], default: 'parent' })
  accountType: 'student' | 'parent';

  @Prop()
  grade?: string;

  @Prop({ type: String, enum: ['customer', 'moderator', 'admin', 'super_admin'], default: 'customer' })
  role: UserRole;

  @Prop({ type: String, enum: ['active', 'banned'], default: 'active' })
  status: UserStatus;

  /** Seed super_admin — cannot be deleted or demoted. */
  @Prop({ default: false })
  isProtected: boolean;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop({ type: Date, default: null })
  lockedUntil: Date | null;

  @Prop({ default: false })
  twoFactorEnabled: boolean;

  @Prop({ type: String, default: null })
  twoFactorSecret: string | null;

  @Prop({ unique: true, sparse: true })
  referralCode?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  referredBy: Types.ObjectId | null;

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ role: 1, status: 1 });
