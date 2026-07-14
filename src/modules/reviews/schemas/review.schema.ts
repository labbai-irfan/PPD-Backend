import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  /** Snapshot for admin table (avoids joins). */
  @Prop({ default: '' })
  productName: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  author: string;

  @Prop()
  avatar?: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status: ReviewStatus;

  @Prop({ default: false })
  verifiedPurchase: boolean;

  @Prop({ default: 0 })
  helpfulCount: number;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

ReviewSchema.index({ productId: 1, status: 1 });
ReviewSchema.index({ userId: 1, productId: 1 }, { unique: true });
