import {
  Controller,
  Post,
  Get,
  Param,
  RawBodyRequest,
  Req,
  Headers,
  UnauthorizedException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

import { PaymentsService } from './payments.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-payment-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('No raw body');
    }

    const valid = this.paymentsService.verifyWebhookSignature(rawBody, signature ?? '');
    if (!valid) {
      this.logger.warn('Invalid webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    const result = await this.paymentsService.handleWebhookEvent(rawBody);
    return result;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by id' })
  getPayment(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.paymentsService.getPayment(id, user.sub, user.role);
  }

  @Post(':id/refund')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: refund a captured payment' })
  adminRefund(@Param('id') id: string) {
    return this.paymentsService.adminRefund(id);
  }
}
