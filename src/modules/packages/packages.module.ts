import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Package, PackageSchema } from './schemas/package.schema';
import { PackagesService } from './packages.service';
import { PackagesController } from './packages.controller';
import { AdminPackagesController } from './admin-packages.controller';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Package.name, schema: PackageSchema }]), ProductsModule],
  controllers: [PackagesController, AdminPackagesController],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
