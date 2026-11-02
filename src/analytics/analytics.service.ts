import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConsultationStats(granularity: 'day' | 'week', from: Date, to: Date) {
    const trunc = granularity === 'week' ? 'week' : 'day';
    return this.prisma.$queryRaw<Array<{ period: string; count: bigint; status: string }>>`
      SELECT
        date_trunc(${trunc}, scheduled_start)::date::text AS period,
        status,
        COUNT(*) AS count
      FROM consultations
      WHERE scheduled_start BETWEEN ${from} AND ${to}
      GROUP BY period, status
      ORDER BY period ASC, status ASC
    `;
  }

  async getTopSpecialties(from: Date, to: Date) {
    return this.prisma.$queryRaw<Array<{ specialty: string; count: bigint }>>`
      SELECT unnest(d.specialties) AS specialty, COUNT(c.id) AS count
      FROM consultations c
      JOIN doctors d ON c.doctor_id = d.id
      WHERE c.scheduled_start BETWEEN ${from} AND ${to}
        AND c.status NOT IN ('cancelled', 'no_show')
      GROUP BY specialty
      ORDER BY count DESC
      LIMIT 10
    `;
  }

  async getRevenue(from: Date, to: Date) {
    return this.prisma.$queryRaw<Array<{ period: string; total_cents: bigint; count: bigint }>>`
      SELECT
        date_trunc('day', p.created_at)::date::text AS period,
        SUM(p.amount_cents) AS total_cents,
        COUNT(*) AS count
      FROM payments p
      WHERE p.status = 'captured'
        AND p.created_at BETWEEN ${from} AND ${to}
      GROUP BY period
      ORDER BY period ASC
    `;
  }

  async getDoctorUtilization() {
    return this.prisma.$queryRaw<Array<{
      doctor_id: string;
      email: string;
      name: string;
      total_slots: bigint;
      booked_slots: bigint;
      completed: bigint;
    }>>`
      SELECT
        d.id AS doctor_id,
        u.email,
        CONCAT(p.first_name, ' ', p.last_name) AS name,
        COUNT(s.id) AS total_slots,
        COUNT(s.id) FILTER (WHERE s.status IN ('booked', 'payment_pending')) AS booked_slots,
        COUNT(c.id) FILTER (WHERE c.status = 'completed') AS completed
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN profiles p ON u.id = p.user_id
      LEFT JOIN availability_slots s ON d.id = s.doctor_id
        AND s.start_at >= now() - interval '30 days'
      LEFT JOIN consultations c ON d.id = c.doctor_id
        AND c.scheduled_start >= now() - interval '30 days'
      WHERE d.verified = true AND u.status = 'active'
      GROUP BY d.id, u.email, p.first_name, p.last_name
      ORDER BY completed DESC
    `;
  }
}
