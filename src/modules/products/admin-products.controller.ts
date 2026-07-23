import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import {
  AdminProductQueryDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/admin-product.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles('moderator')
  @ApiOperation({ summary: 'List all products incl. inactive (admin table)' })
  list(@Query() query: AdminProductQueryDto) {
    return this.productsService.adminList(query);
  }

  @Get('stats')
  @Roles('moderator')
  @ApiOperation({ summary: 'Inventory snapshot for the admin Inventory page' })
  stats() {
    return this.productsService.inventoryStats();
  }

  @Post()
  @ApiOperation({ summary: 'Create a product (slug auto-generated)' })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.adminCreate(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product (stock, price, anything)' })
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.adminUpdate(String(id), dto);
  }

  @Post(':id/toggle')
  @ApiOperation({ summary: 'Toggle active/inactive' })
  toggle(@Param('id', ParseObjectIdPipe) id: string) {
    return this.productsService.adminToggle(String(id));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a product' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    await this.productsService.adminDelete(String(id));
  }
}
