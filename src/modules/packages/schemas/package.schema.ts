import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PackageDocument = HydratedDocument<Package>;

@Schema({ _id: false })
export class PackageItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true, min: 1, default: 1 })
  quantity: number;
}

export const PackageItemSchema = SchemaFactory.createForClass(PackageItem);

@Schema({ timestamps: true })
export class Package {
  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop()
  image?: string;

  @Prop({ type: [PackageItemSchema], default: [] })
  items: PackageItem[];

  /** Bundle price set by the admin. Falls back to the sum of item prices when unset. */
  @Prop({ min: 0 })
  price?: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export const PackageSchema = SchemaFactory.createForClass(Package);
