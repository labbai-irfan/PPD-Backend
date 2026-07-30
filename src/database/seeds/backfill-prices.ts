/**
 * One-off: recompute `price` from MRP + discount + GST for products saved before
 * the selling price was derived server-side (their discount was silently dropped).
 *
 * Dry run:  npx ts-node src/database/seeds/backfill-prices.ts
 * Apply:    npx ts-node src/database/seeds/backfill-prices.ts --apply
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const sellingPrice = (mrp: number, discountPercent = 0, gstPercent = 0) =>
  Math.max(0, Math.round(mrp * (1 - discountPercent / 100) * (1 + gstPercent / 100) * 100) / 100);

async function main() {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  const client = await MongoClient.connect(uri);
  try {
    const products = client.db().collection<{
      title: string;
      price: number;
      mrp: number;
      discountPercent?: number;
      gstPercent?: number;
    }>('products');
    const all = await products
      .find({}, { projection: { title: 1, price: 1, mrp: 1, discountPercent: 1, gstPercent: 1 } })
      .toArray();

    const stale = all
      .map((p) => ({ ...p, expected: sellingPrice(p.mrp, p.discountPercent, p.gstPercent) }))
      .filter((p) => p.expected !== p.price);

    if (!stale.length) {
      console.log(`✅ All ${all.length} products already priced correctly.`);
      return;
    }

    console.log(`${stale.length} of ${all.length} products need repricing:\n`);
    for (const p of stale) {
      console.log(
        `  ${p.title}\n    MRP ₹${p.mrp} − ${p.discountPercent ?? 0}%  →  ₹${p.price} becomes ₹${p.expected}`,
      );
    }

    if (!apply) {
      console.log('\nDry run — nothing written. Re-run with --apply to save.');
      return;
    }

    for (const p of stale) {
      await products.updateOne({ _id: p._id }, { $set: { price: p.expected } });
    }
    console.log(`\n✅ Updated ${stale.length} products.`);
  } finally {
    await client.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
