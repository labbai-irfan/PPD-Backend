import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { Public } from '../../common/decorators/public.decorator';
import { ValidateCouponDto } from '../orders/dto/order.dto';

@ApiTags('coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Active coupons (customer list)' })
  list() {
    return this.couponsService.listActive();
  }

  @Public()
  @Post('validate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Validate a coupon against a subtotal (guests apply in cart)' })
  validate(@Body() dto: ValidateCouponDto) {
    return this.couponsService.validate(dto.code, dto.subtotal);
  }
}
