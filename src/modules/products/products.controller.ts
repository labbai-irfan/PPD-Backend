import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductQueryDto, ProductsByIdsDto } from './dto/product-query.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('catalog')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products with filters, sort and pagination' })
  list(@Query() query: ProductQueryDto) {
    return this.productsService.list(query);
  }

  @Post('by-ids')
  @ApiOperation({ summary: 'Fetch products by ids or slugs (wishlist / compare)' })
  byIds(@Body() dto: ProductsByIdsDto) {
    return this.productsService.getByIds(dto.ids);
  }

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Product details by Mongo id or slug' })
  get(@Param('idOrSlug') idOrSlug: string) {
    return this.productsService.getByIdOrSlug(idOrSlug);
  }

  @Get(':idOrSlug/related')
  @ApiOperation({ summary: 'Related products (same category)' })
  related(@Param('idOrSlug') idOrSlug: string) {
    return this.productsService.getRelated(idOrSlug);
  }
}
