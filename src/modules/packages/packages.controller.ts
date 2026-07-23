import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PackagesService } from './packages.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('catalog')
@Public()
@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get()
  @ApiOperation({ summary: 'Active packages (bundles) with computed pricing' })
  list() {
    return this.packagesService.list();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Package detail by slug — full item list + pricing' })
  getBySlug(@Param('slug') slug: string) {
    return this.packagesService.getBySlug(slug);
  }
}
