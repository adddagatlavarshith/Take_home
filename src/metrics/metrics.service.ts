import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  register,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry: Registry;

  readonly httpRequestDuration: Histogram<string>;
  readonly bookingsTotal: Counter<string>;
  readonly consultationsTotal: Counter<string>;
  readonly paymentsTotal: Counter<string>;
  readonly idempotencyReplays: Counter<string>;
  readonly doubleBookingRejections: Counter<string>;

  constructor() {
    this.registry = register;
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    });

    this.bookingsTotal = new Counter({
      name: 'bookings_total',
      help: 'Total booking attempts',
      labelNames: ['status'],
    });

    this.consultationsTotal = new Counter({
      name: 'consultations_total',
      help: 'Total consultations by status',
      labelNames: ['status'],
    });

    this.paymentsTotal = new Counter({
      name: 'payments_total',
      help: 'Total payment events',
      labelNames: ['status'],
    });

    this.idempotencyReplays = new Counter({
      name: 'idempotency_replays_total',
      help: 'Total idempotency key replays',
    });

    this.doubleBookingRejections = new Counter({
      name: 'double_booking_rejections_total',
      help: 'Total double-booking rejection 409s',
    });
  }

  onModuleInit() {
    // Metrics registered on construction; nothing additional needed
  }

  recordBooking(status: string) {
    this.bookingsTotal.inc({ status });
  }

  recordConsultation(status: string) {
    this.consultationsTotal.inc({ status });
  }

  recordPayment(status: string) {
    this.paymentsTotal.inc({ status });
  }

  recordIdempotencyReplay() {
    this.idempotencyReplays.inc();
  }

  recordDoubleBookingRejection() {
    this.doubleBookingRejections.inc();
  }
}
