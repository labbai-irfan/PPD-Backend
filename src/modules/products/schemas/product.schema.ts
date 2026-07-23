import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const PRODUCT_TAGS = ['featured', 'deal', 'new', 'bestseller', 'trending'] as const;
export type ProductTag = (typeof PRODUCT_TAGS)[number];

export type ProductDocument = HydratedDocument<Product>;

@Schema({ _id: false })
export class ProductFaq {
  @Prop({ required: true })
  question: string;

  @Prop({ required: true })
  answer: string;
}

export const ProductFaqSchema = SchemaFactory.createForClass(ProductFaq);

@Schema({ _id: false })
export class ProductSpec {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  value: string;
}

export const ProductSpecSchema = SchemaFactory.createForClass(ProductSpec);

/** A restock lot — quantity received at a given internal cost price. Feeds the product's total `stock`. */
@Schema({ _id: false })
export class ProductBatch {
  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  costPrice: number;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const ProductBatchSchema = SchemaFactory.createForClass(ProductBatch);

@Schema({ _id: false })
export class VariantValue {
  @Prop({ required: true })
  value: string;

  @Prop({ required: true })
  label: string;

  @Prop()
  swatch?: string;

  @Prop({ default: true })
  inStock: boolean;
}

@Schema({ _id: false })
export class ProductVariantOption {
  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  label: string;

  @Prop({ type: [VariantValue], default: [] })
  values: VariantValue[];
}

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  brand: string;

  /** Category slug (frontend filters by slug). */
  @Prop({ required: true })
  category: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  shortDescription: string;

  @Prop({ type: [String], default: [] })
  highlights: string[];

  /** Internal catalog code — optional, unique when set. */
  @Prop()
  sku?: string;

  @Prop()
  hsnCode?: string;

  @Prop({ type: [ProductFaqSchema], default: [] })
  faqs: ProductFaq[];

  /** Free-form label/value pairs — colour, material, etc. — shown as a table on the product page. */
  @Prop({ type: [ProductSpecSchema], default: [] })
  specs: ProductSpec[];

  /** Restock lots. When present, `stock` is kept as their summed quantity. */
  @Prop({ type: [ProductBatchSchema], default: [] })
  batches: ProductBatch[];

  @Prop()
  weightPerUnit?: number;

  @Prop({ type: String, enum: ['kg', 'g'], default: 'kg' })
  weightUnit: 'kg' | 'g';

  /** Admin pricing-calculator inputs, kept so re-editing shows the same numbers back. */
  @Prop({ min: 0, max: 100 })
  discountPercent?: number;

  @Prop({ min: 0, max: 100 })
  gstPercent?: number;

  @Prop({ type: String, enum: ['draft', 'published'], default: 'published' })
  status: 'draft' | 'published';

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, min: 0 })
  mrp: number;

  @Prop({ required: true, min: 0, default: 0 })
  stock: number;

  @Prop({ default: 0, min: 0, max: 5 })
  rating: number;

  @Prop({ default: 0 })
  ratingCount: number;

  @Prop({ default: 0 })
  reviewCount: number;

  @Prop({ type: [ProductVariantOption], default: [] })
  variants: ProductVariantOption[];

  @Prop({ type: [String], enum: PRODUCT_TAGS, default: [] })
  tags: ProductTag[];

  /** Display string, e.g. "1.5K+ bought" */
  @Prop()
  bought?: string;

  @Prop({ default: 2 })
  deliveryDays: number;

  @Prop({ default: 7 })
  returnDays: number;

  @Prop({ default: false })
  isPpdOriginal: boolean;

  @Prop({ default: false })
  isFreeDelivery: boolean;

  @Prop()
  freeDeliveryThreshold?: number;

  @Prop({ default: 0 })
  salesCount: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ category: 1, isActive: 1 });
ProductSchema.index({ tags: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ title: 'text', brand: 'text', description: 'text' });
ProductSchema.index({ sku: 1 }, { unique: true, sparse: true });
