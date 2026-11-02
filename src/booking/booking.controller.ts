import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';

import { BookingService } from './booking.service';
import { HoldSlotDto, ConfirmBookingDto } from './dto/booking.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';

@ApiTags('booking')
@ApiBearerAuth()
@Controller({ path: 'bookings', version: '1' })
export class BookingController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('hold')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Atomically hold a slot (Idempotency-Key required)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async holdSlot(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: HoldSlotDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idempotencyKey) {
      res.status(HttpStatus.UNPROCESSABLE_ENTITY);
      return { message: 'Idempotency-Key header is required' };
    }

    const route = 'POST /bookings/hold';
    const cached = await this.idempotency.check(user.sub, idempotencyKey, route, dto);
    if (cached.hit) {
      res.status(cached.statusCode ?? 200);
      return cached.body;
    }

    await this.idempotency.start(user.sub, idempotencyKey, route, dto);
    const result = await this.bookingService.holdSlot(user.sub, dto);
    await this.idempotency.complete(user.sub, idempotencyKey, route, HttpStatus.CREATED, result);
    res.status(HttpStatus.CREATED);
    return result;
  }

  @Post(':holdId/confirm')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Confirm hold and create payment intent (Idempotency-Key required)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async confirmBooking(
    @Headers('idempotency-key') idempotencyKey: string,
    @Param('holdId') holdId: string,
    @Body() dto: ConfirmBookingDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idempotencyKey) {
      res.status(HttpStatus.UNPROCESSABLE_ENTITY);
      return { message: 'Idempotency-Key header is required' };
    }

    const route = `POST /bookings/${holdId}/confirm`;
    const cached = await this.idempotency.check(user.sub, idempotencyKey, route, dto);
    if (cached.hit) {
      res.status(cached.statusCode ?? 200);
      return cached.body;
    }

    await this.idempotency.start(user.sub, idempotencyKey, route, dto);
    const result = await this.bookingService.confirmBooking(holdId, user.sub, dto);
    await this.idempotency.complete(user.sub, idempotencyKey, route, HttpStatus.CREATED, result);
    res.status(HttpStatus.CREATED);
    return result;
  }

  @Post(':holdId/cancel')
  @Roles(UserRole.patient)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a hold before payment' })
  cancelHold(
    @Param('holdId') holdId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookingService.cancelHold(holdId, user.sub);
  }
}
