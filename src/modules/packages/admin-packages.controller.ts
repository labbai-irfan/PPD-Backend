import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PackagesService } from './packages.service';
import { CreatePackageDto, UpdatePackageDto } from './dto/package.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/packages')
export class AdminPackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get()
  @ApiOperation({ summary: 'All packages, any status' })
  adminList() {
    return this.packagesService.adminList();
  }

  @Post()
  @ApiOperation({ summary: 'Create a package (slug auto-generated)' })
  create(@Body() dto: CreatePackageDto) {
    return this.packagesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a package (renaming keeps the slug)' })
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdatePackageDto) {
    return this.packagesService.update(String(id), dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a package' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    await this.packagesService.remove(String(id));
  }
}
