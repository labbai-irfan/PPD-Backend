import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ORDER_STATUSES, PAYMENT_METHODS } from '../schemas/order.schema';

export class OrderItemInputDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Variant selections, e.g. {"size":"M"}' })
  @IsOptional()
  @IsObject()
  selections?: Record<string, string>;
}

export class OrderAddressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty()
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile' })
  phone: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  line1: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  line2?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  city: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  state: string;

  @ApiProperty()
  @Matches(/^\d{6}$/, { message: 'pincode must be 6 digits' })
  pincode: string;

  @ApiPropertyOptional({ enum: ['home', 'work', 'other'] })
  @IsOptional()
  @IsIn(['home', 'work', 'other'])
  type?: string;
}

export class OrderPaymentDto {
  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method: (typeof PAYMENT_METHODS)[number];

  @ApiProperty({ example: 'Cash on Delivery' })
  @IsString()
  label: string;

  @ApiPropertyOptional({ description: 'Completed payment intent id (required for online methods)' })
  @IsOptional()
  @IsString()
  intentId?: string;
}

export class PlaceOrderDto {
  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];

  @ApiProperty({ type: OrderAddressDto })
  @ValidateNested()
  @Type(() => OrderAddressDto)
  address: OrderAddressDto;

  @ApiProperty({ type: OrderPaymentDto })
  @ValidateNested()
  @Type(() => OrderPaymentDto)
  payment: OrderPaymentDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  couponCode?: string;
}

export class CancelOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class OrderListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: (typeof ORDER_STATUSES)[number];
}

export class AdminOrderQueryDto extends OrderListQueryDto {
  @ApiPropertyOptional({ description: 'Search order number / customer name' })
  @IsOptional()
  @IsString()
  q?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES })
  @IsIn(ORDER_STATUSES)
  status: (typeof ORDER_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class ValidateCouponDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @MinLength(2)
  code: string;

  @ApiProperty({ example: 1500 })
  @Type(() => Number)
  @Min(0)
  subtotal: number;
}
