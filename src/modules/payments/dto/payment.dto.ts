import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { OrderItemInputDto } from '../../orders/dto/order.dto';
import { PAYMENT_INTENT_METHODS } from '../schemas/payment-intent.schema';

/** Delivery location — shipping depends on it, so the charge must know it up front. */
export class IntentDestinationDto {
  @ApiProperty()
  @IsString()
  country: string;

  @ApiProperty()
  @IsString()
  state: string;

  @ApiProperty()
  @IsString()
  city: string;

  @ApiProperty()
  @Matches(/^\d{6}$/, { message: 'pincode must be 6 digits' })
  pincode: string;
}

export class CreateIntentDto {
  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];

  @ApiPropertyOptional({ example: 'WELCOME10' })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional({ type: IntentDestinationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IntentDestinationDto)
  address?: IntentDestinationDto;

  @ApiProperty({ enum: PAYMENT_INTENT_METHODS })
  @IsIn(PAYMENT_INTENT_METHODS)
  method: (typeof PAYMENT_INTENT_METHODS)[number];
}

/** Only sanitized card details ever reach the backend — never the full PAN/CVV. */
export class MockCardDto {
  @ApiProperty({ example: '4242' })
  @Matches(/^\d{4}$/, { message: 'last4 must be exactly 4 digits' })
  last4: string;

  @ApiProperty({ example: 'visa' })
  @IsString()
  brand: string;
}

export class ConfirmMockDto {
  @ApiPropertyOptional({ type: MockCardDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MockCardDto)
  card?: MockCardDto;

  @ApiPropertyOptional({ example: 'name@okbank' })
  @IsOptional()
  @IsString()
  vpa?: string;

  @ApiPropertyOptional({ example: 'HDFC' })
  @IsOptional()
  @IsString()
  bank?: string;
}

export class VerifyPaymentDto {
  @ApiProperty()
  @IsString()
  intentId: string;

  @ApiProperty()
  @IsString()
  razorpayOrderId: string;

  @ApiProperty()
  @IsString()
  razorpayPaymentId: string;

  @ApiProperty()
  @IsString()
  razorpaySignature: string;
}
