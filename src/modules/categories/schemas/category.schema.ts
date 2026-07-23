import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  name: string;

  /** Parent category (top-level categories leave this null; subcategories are one level deep). */
  @Prop({ type: Types.ObjectId, ref: 'Category', default: null })
  parentId: Types.ObjectId | null;

  /** Material Symbols name or emoji. */
  @Prop({ default: 'category' })
  icon: string;

  /** Short blurb shown on category cards. */
  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  color: string;

  @Prop()
  image?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
