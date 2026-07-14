import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CouponDocument = HydratedDocument<Coupon>;

/** Canonical coupon — serves both the customer list and admin CRUD. */
@Schema({ timestamps: true })
export class Coupon {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ default: '' })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: String, enum: ['flat', 'percent'], required: true })
  kind: 'flat' | 'percent';

  @Prop({ required: true, min: 0 })
  value: number;

  @Prop({ default: 0 })
  minOrder: number;

  @Prop({ type: Number, default: null })
  maxDiscount: number | null;

  @Prop({ default: () => new Date() })
  startsAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Number, default: null })
  usageLimit: number | null;

  @Prop({ default: 1 })
  perUserLimit: number;

  @Prop({ default: 0 })
  usedCount: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);

CouponSchema.index({ expiresAt: 1 });
