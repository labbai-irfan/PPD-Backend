import { Body, Controller, Get, Header, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminOrderQueryDto, UpdateOrderStatusDto } from './dto/order.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('moderator')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'All orders (search + status filter)' })
  list(@Query() query: AdminOrderQueryDto) {
    return this.ordersService.adminList(query);
  }

  @Get('export')
  @Roles('admin')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="orders.csv"')
  @ApiOperation({ summary: 'Export all orders as CSV' })
  exportCsv() {
    return this.ordersService.exportCsv();
  }

  @Get(':idOrNumber')
  @ApiOperation({ summary: 'Order details' })
  get(@Param('idOrNumber') idOrNumber: string) {
    return this.ordersService.adminGet(idOrNumber);
  }

  @Patch(':idOrNumber/status')
  @Roles('admin')
  @ApiOperation({ summary: 'Advance order status (validated transitions)' })
  updateStatus(@Param('idOrNumber') idOrNumber: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.adminUpdateStatus(idOrNumber, dto.status, dto.location, dto.note);
  }
}
