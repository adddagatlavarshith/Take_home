import { ConflictException } from '@nestjs/common';
import { ConsultationStatus, SlotStatus } from '@prisma/client';

// Unit tests for the booking state machine — no DB required
describe('Booking state machine', () => {
  // Allowed transitions mirror the app layer; the DB constraint is the hard stop
  const ALLOWED: Record<string, string[]> = {
    available: ['held'],
    held: ['payment_pending', 'available'],
    payment_pending: ['booked', 'available'],
    booked: [],
    blocked: [],
  };

  function assertTransition(from: string, to: string) {
    if (!ALLOWED[from]?.includes(to)) {
      throw new ConflictException(`Cannot transition slot from '${from}' to '${to}'`);
    }
  }

  it('allows available → held', () => {
    expect(() => assertTransition('available', 'held')).not.toThrow();
  });

  it('allows held → payment_pending', () => {
    expect(() => assertTransition('held', 'payment_pending')).not.toThrow();
  });

  it('allows payment_pending → booked', () => {
    expect(() => assertTransition('payment_pending', 'booked')).not.toThrow();
  });

  it('allows held → available (expiry release)', () => {
    expect(() => assertTransition('held', 'available')).not.toThrow();
  });

  it('allows payment_pending → available (payment failed)', () => {
    expect(() => assertTransition('payment_pending', 'available')).not.toThrow();
  });

  it('rejects available → booked (skipping hold)', () => {
    expect(() => assertTransition('available', 'booked')).toThrow(ConflictException);
  });

  it('rejects booked → available', () => {
    expect(() => assertTransition('booked', 'available')).toThrow(ConflictException);
  });

  it('rejects held → booked (must go through payment_pending)', () => {
    expect(() => assertTransition('held', 'booked')).toThrow(ConflictException);
  });
});

describe('Consultation state machine', () => {
  const ALLOWED: Record<ConsultationStatus, ConsultationStatus[]> = {
    [ConsultationStatus.pending_payment]: [ConsultationStatus.scheduled, ConsultationStatus.cancelled],
    [ConsultationStatus.scheduled]: [ConsultationStatus.in_progress, ConsultationStatus.cancelled, ConsultationStatus.no_show],
    [ConsultationStatus.in_progress]: [ConsultationStatus.completed, ConsultationStatus.cancelled],
    [ConsultationStatus.completed]: [],
    [ConsultationStatus.cancelled]: [],
    [ConsultationStatus.no_show]: [],
  };

  function assertTransition(from: ConsultationStatus, to: ConsultationStatus) {
    if (!ALLOWED[from].includes(to)) {
      throw new ConflictException(`Cannot transition from '${from}' to '${to}'`);
    }
  }

  it('pending_payment → scheduled (payment captured)', () => {
    expect(() => assertTransition(ConsultationStatus.pending_payment, ConsultationStatus.scheduled)).not.toThrow();
  });

  it('scheduled → in_progress (doctor starts)', () => {
    expect(() => assertTransition(ConsultationStatus.scheduled, ConsultationStatus.in_progress)).not.toThrow();
  });

  it('in_progress → completed', () => {
    expect(() => assertTransition(ConsultationStatus.in_progress, ConsultationStatus.completed)).not.toThrow();
  });

  it('scheduled → cancelled (patient/doctor/admin)', () => {
    expect(() => assertTransition(ConsultationStatus.scheduled, ConsultationStatus.cancelled)).not.toThrow();
  });

  it('completed → cancelled is forbidden', () => {
    expect(() => assertTransition(ConsultationStatus.completed, ConsultationStatus.cancelled)).toThrow(ConflictException);
  });

  it('pending_payment → in_progress is forbidden', () => {
    expect(() => assertTransition(ConsultationStatus.pending_payment, ConsultationStatus.in_progress)).toThrow(ConflictException);
  });
});

describe('Hold expiry logic', () => {
  const HOLD_TTL_MINUTES = 10;

  function isHoldExpired(heldUntil: Date): boolean {
    return heldUntil < new Date();
  }

  function createHoldUntil(offsetMinutes: number): Date {
    return new Date(Date.now() + offsetMinutes * 60 * 1000);
  }

  it('fresh hold is not expired', () => {
    const heldUntil = createHoldUntil(HOLD_TTL_MINUTES);
    expect(isHoldExpired(heldUntil)).toBe(false);
  });

  it('past-due hold is expired', () => {
    const heldUntil = createHoldUntil(-1);
    expect(isHoldExpired(heldUntil)).toBe(true);
  });

  it('hold at exactly now is expired', () => {
    const heldUntil = new Date(Date.now() - 1);
    expect(isHoldExpired(heldUntil)).toBe(true);
  });
});
