import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BannerDocument = HydratedDocument<Banner>;

@Schema({ timestamps: true })
export class Banner {
  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  subtitle: string;

  @Prop({ default: 'Shop Now' })
  cta: string;

  @Prop({ default: '/' })
  href: string;

  @Prop({ default: '' })
  image: string;

  /** Tailwind gradient classes used by the frontend. */
  @Prop({ default: 'bg-grad-hero' })
  tone: string;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const BannerSchema = SchemaFactory.createForClass(Banner);
