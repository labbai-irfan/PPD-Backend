import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HomeContentDocument = HydratedDocument<HomeContent>;

/**
 * Singleton document for the designed home screen sections.
 * Field names mirror frontend/src/mocks/home.ts exactly so the
 * frontend can consume the response without renaming.
 */
@Schema({ timestamps: true, collection: 'homecontent' })
export class HomeContent {
  @Prop({ type: [{ title: String, image: String, href: String }], default: [] })
  houseCards: { title: string; image: string; href: string }[];

  @Prop({ type: [{ label: String, image: String, href: String }], default: [] })
  yogaTiles: { label: string; image: string; href: string }[];

  @Prop({
    type: [{ name: String, desc: String, price: Number, image: String, productId: String }],
    default: [],
  })
  yogaPromos: { name: string; desc: string; price: number; image: string; productId: string }[];

  @Prop({
    type: [{ name: String, blurb: String, price: Number, image: String, href: String }],
    default: [],
  })
  packages: { name: string; blurb: string; price: number; image: string; href: string }[];

  @Prop({ type: [String], default: [] })
  categoryChips: string[];

  @Prop({ type: [String], default: [] })
  popularSearches: string[];
}

export const HomeContentSchema = SchemaFactory.createForClass(HomeContent);
