import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CancelOrderDto, OrderListQueryDto, PlaceOrderDto } from './dto/order.dto';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Place an order (server-side pricing + stock check)' })
  place(@CurrentUser('sub') userId: string, @Body() dto: PlaceOrderDto) {
    return this.ordersService.place(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'My orders (paginated, optional status filter)' })
  list(@CurrentUser('sub') userId: string, @Query() query: OrderListQueryDto) {
    return this.ordersService.listMine(userId, query);
  }

  @Get(':idOrNumber')
  @ApiOperation({ summary: 'One of my orders by id or order number' })
  get(@CurrentUser('sub') userId: string, @Param('idOrNumber') idOrNumber: string) {
    return this.ordersService.getOwn(userId, idOrNumber);
  }

  @Get(':idOrNumber/track')
  @ApiOperation({ summary: 'Tracking timeline for one of my orders' })
  track(@CurrentUser('sub') userId: string, @Param('idOrNumber') idOrNumber: string) {
    return this.ordersService.track(userId, idOrNumber);
  }

  @Post(':idOrNumber/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel my order (only placed/confirmed)' })
  cancel(
    @CurrentUser('sub') userId: string,
    @Param('idOrNumber') idOrNumber: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancel(userId, idOrNumber, dto.reason);
  }
}
