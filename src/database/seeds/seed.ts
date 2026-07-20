/**
 * Seed script — run with: npm run seed
 *
 * Catalog collections (products/categories/brands/banners/home/coupons) are
 * WIPED and re-inserted for a deterministic dev state. Users are upserted
 * (existing accounts and their passwords are left untouched).
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { AppModule } from '../../app.module';
import { Product } from '../../modules/products/schemas/product.schema';
import { Category } from '../../modules/categories/schemas/category.schema';
import { Brand } from '../../modules/brands/schemas/brand.schema';
import { Banner } from '../../modules/banners/schemas/banner.schema';
import { HomeContent } from '../../modules/banners/schemas/home-content.schema';
import { Coupon } from '../../modules/coupons/schemas/coupon.schema';
import { User } from '../../modules/users/schemas/user.schema';
import { Review } from '../../modules/reviews/schemas/review.schema';
import { generateReferralCode } from '../../common/utils';
import {
  seedBanners,
  seedBrands,
  seedCategories,
  seedCoupons,
  seedHomeContent,
  seedProducts,
} from './seed-data';

async function seed() {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    const productModel = app.get<Model<Product>>(getModelToken(Product.name));
    const categoryModel = app.get<Model<Category>>(getModelToken(Category.name));
    const brandModel = app.get<Model<Brand>>(getModelToken(Brand.name));
    const bannerModel = app.get<Model<Banner>>(getModelToken(Banner.name));
    const homeModel = app.get<Model<HomeContent>>(getModelToken(HomeContent.name));
    const couponModel = app.get<Model<Coupon>>(getModelToken(Coupon.name));
    const userModel = app.get<Model<User>>(getModelToken(User.name));
    const reviewModel = app.get<Model<Review>>(getModelToken(Review.name));

    // --- Catalog: wipe + insert ---
    await productModel.deleteMany({});
    await productModel.insertMany(seedProducts);
    logger.log(`products: ${seedProducts.length} inserted`);

    await categoryModel.deleteMany({});
    await categoryModel.insertMany(seedCategories);
    logger.log(`categories: ${seedCategories.length} inserted`);

    await brandModel.deleteMany({});
    await brandModel.insertMany(seedBrands);
    logger.log(`brands: ${seedBrands.length} inserted`);

    await bannerModel.deleteMany({});
    await bannerModel.insertMany(seedBanners);
    logger.log(`banners: ${seedBanners.length} inserted`);

    await homeModel.deleteMany({});
    await homeModel.create(seedHomeContent);
    logger.log('home content: singleton inserted');

    await couponModel.deleteMany({});
    await couponModel.insertMany(seedCoupons);
    logger.log(`coupons: ${seedCoupons.length} inserted`);

    // --- Users: upsert (never overwrite existing) ---
    const accounts = [
      {
        email: 'admin@ppdstore.com',
        name: 'PPD Admin',
        password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!@#',
        role: 'super_admin' as const,
        isProtected: true,
      },
      {
        email: 'demo@example.com',
        name: 'Demo User',
        password: process.env.SEED_DEMO_PASSWORD || 'ChangeMe123!@#',
        role: 'customer' as const,
        isProtected: false,
      },
    ];

    for (const account of accounts) {
      const exists = await userModel.findOne({ email: account.email }).exec();
      if (exists) {
        logger.log(`user ${account.email}: already exists, skipped`);
        continue;
      }
      await userModel.create({
        name: account.name,
        email: account.email,
        passwordHash: await bcrypt.hash(account.password, 12),
        role: account.role,
        isProtected: account.isProtected,
        referralCode: generateReferralCode(),
      });
      logger.log(`user ${account.email}: created (${account.role})`);
    }

    // --- Reviews: wipe + insert (mapped to seeded products + demo user) ---
    const demoUser = await userModel.findOne({ email: 'demo@example.com' }).exec();
    const bySlug = async (slug: string) => productModel.findOne({ slug }).select('_id title').exec();

    if (demoUser) {
      await reviewModel.deleteMany({});
      const reviewSeeds: { slug: string; author: string; rating: number; title: string; body: string; status: string }[] = [
        {
          slug: 'santoor-with-activities-class-4-ncert',
          author: 'Aarav Mehta',
          rating: 5,
          title: 'Perfect for Class 4 prep',
          body: 'The in-book activities keep my son engaged and the illustrations are excellent. Exactly matches the NCERT syllabus his school follows.',
          status: 'approved',
        },
        {
          slug: 'camlin-scholar-pro-geometry-box',
          author: 'Priya Sharma',
          rating: 4,
          title: 'Solid geometry kit',
          body: 'The compass is genuinely self-centering and the case has survived a full term in the school bag. Protractor markings are crisp and readable.',
          status: 'approved',
        },
        {
          slug: 'a5-classic-spiral-bound-notebooks',
          author: 'Rahul Verma',
          rating: 5,
          title: 'Best notebooks for daily notes',
          body: 'Lay-flat binding makes writing near the spiral painless. Paper takes fountain pen ink without bleeding through, which is rare at this price.',
          status: 'approved',
        },
        {
          slug: 'ppd-school-backpack',
          author: 'Sneha Iyer',
          rating: 4,
          title: 'Comfortable even fully loaded',
          body: 'My daughter carries six textbooks daily and the padded straps still hold up. The rain shell worked in a proper monsoon downpour.',
          status: 'pending',
        },
        {
          slug: 'dual-tips-24-colours-markers',
          author: 'Vikram Nair',
          rating: 3,
          title: 'Good colours, caps could be better',
          body: 'Colour range is lovely and truly non-toxic smelling, but two caps cracked within a month. Fine for school art projects overall.',
          status: 'pending',
        },
      ];

      let inserted = 0;
      for (const [i, r] of reviewSeeds.entries()) {
        const product = await bySlug(r.slug);
        if (!product) continue;
        // Unique index is (userId, productId) — vary userId only via demo user once; use admin for others
        const authorUser = i === 0 ? demoUser : await userModel.findOne({ email: 'admin@ppdstore.com' }).exec();
        await reviewModel.create({
          productId: product._id,
          productName: (product as unknown as { title: string }).title,
          userId: i < 2 ? demoUser._id : (authorUser?._id ?? demoUser._id),
          author: r.author,
          rating: r.rating,
          title: r.title,
          body: r.body,
          status: r.status as 'pending' | 'approved' | 'rejected',
          verifiedPurchase: r.status === 'approved',
        }).then(() => inserted++).catch(() => {});
      }
      logger.log(`reviews: ${inserted} inserted`);
    }

    logger.log('✅ Seed complete');
  } finally {
    await app.close();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
