import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConfirmMockDto, CreateIntentDto, VerifyPaymentDto } from './dto/payment.dto';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('config')
  @ApiOperation({ summary: 'Active payment provider + public key (checkout is authed)' })
  getConfig() {
    return this.paymentsService.getConfig();
  }

  @Post('intent')
  @ApiOperation({ summary: 'Create a payment intent (server-side pricing, no stock mutation)' })
  createIntent(@CurrentUser('sub') userId: string, @Body() dto: CreateIntentDto) {
    return this.paymentsService.createIntent(userId, dto);
  }

  @Post('intent/:intentId/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm a mock-provider payment (simulated gateway)' })
  confirmMock(
    @CurrentUser('sub') userId: string,
    @Param('intentId') intentId: string,
    @Body() dto: ConfirmMockDto,
  ) {
    return this.paymentsService.confirmMock(userId, intentId, dto);
  }

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify a Razorpay payment signature' })
  verify(@CurrentUser('sub') userId: string, @Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyRazorpay(userId, dto);
  }
}
