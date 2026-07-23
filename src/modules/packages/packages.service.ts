import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Package, PackageDocument } from './schemas/package.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { CreatePackageDto, UpdatePackageDto } from './dto/package.dto';
import { slugify } from '../../common/utils';

@Injectable()
export class PackagesService {
  constructor(
    @InjectModel(Package.name) private readonly packageModel: Model<PackageDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  /** Active packages, cheapest-sorted-by-admin order, with computed bundle pricing. */
  async list() {
    const packages = await this.packageModel.find({ isActive: true }).sort({ sortOrder: 1 }).exec();
    return this.toViews(packages);
  }

  async getBySlug(slug: string) {
    const pkg = await this.packageModel.findOne({ slug, isActive: true }).exec();
    if (!pkg) throw new NotFoundException('Package not found');
    const [view] = await this.toViews([pkg]);
    return view;
  }

  /** All packages regardless of status, for the admin manager. */
  async adminList() {
    const packages = await this.packageModel.find().sort({ sortOrder: 1 }).exec();
    return this.toViews(packages);
  }

  async create(dto: CreatePackageDto) {
    await this.assertProductsExist(dto.items.map((i) => i.productId));
    const slug = slugify(dto.name);
    const exists = await this.packageModel.findOne({ slug }).exec();
    if (exists) throw new ConflictException('A package with this name already exists');

    const maxSort = await this.packageModel.findOne().sort({ sortOrder: -1 }).select('sortOrder').exec();
    const created = await this.packageModel.create({
      name: dto.name,
      slug,
      description: dto.description ?? '',
      image: dto.image,
      items: dto.items.map((i) => ({ productId: new Types.ObjectId(i.productId), quantity: i.quantity ?? 1 })),
      price: dto.price,
      isActive: dto.isActive ?? true,
      sortOrder: (maxSort?.sortOrder ?? 0) + 1,
    });
    const [view] = await this.toViews([created]);
    return view;
  }

  async update(id: string, dto: UpdatePackageDto) {
    const pkg = await this.packageModel.findById(id).exec();
    if (!pkg) throw new NotFoundException('Package not found');

    if (dto.items) {
      if (!dto.items.length) throw new BadRequestException('A package needs at least one item');
      await this.assertProductsExist(dto.items.map((i) => i.productId));
      pkg.items = dto.items.map((i) => ({ productId: new Types.ObjectId(i.productId), quantity: i.quantity ?? 1 }));
    }
    // Renaming keeps the slug (like categories), so any bookmarked/shared package link stays valid.
    if (dto.name !== undefined) pkg.name = dto.name;
    if (dto.description !== undefined) pkg.description = dto.description;
    if (dto.image !== undefined) pkg.image = dto.image;
    if (dto.price !== undefined) pkg.price = dto.price;
    if (dto.isActive !== undefined) pkg.isActive = dto.isActive;

    await pkg.save();
    const [view] = await this.toViews([pkg]);
    return view;
  }

  async remove(id: string) {
    const pkg = await this.packageModel.findById(id).exec();
    if (!pkg) throw new NotFoundException('Package not found');
    await pkg.deleteOne();
  }

  private async assertProductsExist(ids: string[]) {
    const invalid = ids.filter((id) => !Types.ObjectId.isValid(id));
    if (invalid.length) throw new BadRequestException('Invalid product id in package items');
    const count = await this.productModel.countDocuments({ _id: { $in: ids } });
    if (count !== new Set(ids).size) {
      throw new BadRequestException('One or more products in this package no longer exist');
    }
  }

  /** Resolves item products in bulk and computes bundle vs. original pricing for each package. */
  private async toViews(packages: PackageDocument[]) {
    const productIds = [...new Set(packages.flatMap((p) => p.items.map((i) => i.productId.toString())))];
    const products = productIds.length
      ? await this.productModel
          .find({ _id: { $in: productIds } })
          .select('title slug brand images price mrp stock isActive')
          .exec()
      : [];
    const byId = new Map(products.map((p) => [p._id.toString(), p]));

    return packages.map((pkg) => {
      const items = pkg.items
        .map((i) => {
          const product = byId.get(i.productId.toString());
          if (!product) return null;
          return {
            productId: product._id.toHexString(),
            slug: product.slug,
            title: product.title,
            brand: product.brand,
            image: product.images[0] ?? '',
            price: product.price,
            mrp: product.mrp,
            stock: product.stock,
            isActive: product.isActive,
            quantity: i.quantity,
          };
        })
        .filter((i): i is NonNullable<typeof i> => i !== null);

      const originalTotal = items.reduce((sum, i) => sum + i.mrp * i.quantity, 0);
      const itemsTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const price = pkg.price ?? itemsTotal;

      return {
        id: pkg._id.toHexString(),
        slug: pkg.slug,
        name: pkg.name,
        description: pkg.description,
        image: pkg.image || items[0]?.image || '',
        isActive: pkg.isActive,
        sortOrder: pkg.sortOrder,
        itemCount: items.length,
        price,
        originalTotal,
        savings: Math.max(0, originalTotal - price),
        items,
      };
    });
  }
}
