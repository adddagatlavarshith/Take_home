import { BadRequestException } from '@nestjs/common';
import { ConsultationMode, SlotStatus } from '@prisma/client';

// Pure logic tests for slot generation — no DB required

describe('Slot materialization math', () => {
  function generateSlots(
    startTime: string,
    endTime: string,
    slotDurationMin: number,
    date: Date,
  ): Array<{ startAt: Date; endAt: Date }> {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const slots = [];
    let slotStart = new Date(date);
    slotStart.setHours(startH, startM, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(endH, endM, 0, 0);

    while (slotStart < dayEnd) {
      const slotEnd = new Date(slotStart.getTime() + slotDurationMin * 60 * 1000);
      if (slotEnd > dayEnd) break;
      slots.push({ startAt: new Date(slotStart), endAt: new Date(slotEnd) });
      slotStart = slotEnd;
    }

    return slots;
  }

  it('generates correct number of 30-min slots for a 9–17 window', () => {
    const date = new Date('2026-11-10');
    const slots = generateSlots('09:00', '17:00', 30, date);
    expect(slots).toHaveLength(16); // 8h / 30min = 16
  });

  it('generates correct number of 60-min slots for a 10–14 window', () => {
    const date = new Date('2026-11-10');
    const slots = generateSlots('10:00', '14:00', 60, date);
    expect(slots).toHaveLength(4);
  });

  it('drops the last slot if it would exceed the window', () => {
    const date = new Date('2026-11-10');
    const slots = generateSlots('09:00', '10:45', 30, date);
    // 9:00–9:30, 9:30–10:00, 10:00–10:30 — 10:30–11:00 would exceed 10:45
    expect(slots).toHaveLength(3);
    expect(slots[2].endAt.getHours()).toBe(10);
    expect(slots[2].endAt.getMinutes()).toBe(30);
  });

  it('slot start and end times are sequential', () => {
    const date = new Date('2026-11-10');
    const slots = generateSlots('08:00', '12:00', 30, date);
    for (let i = 0; i < slots.length - 1; i++) {
      expect(slots[i + 1].startAt.getTime()).toBe(slots[i].endAt.getTime());
    }
  });

  it('returns empty array when window is too small for any slot', () => {
    const date = new Date('2026-11-10');
    const slots = generateSlots('09:00', '09:20', 30, date);
    expect(slots).toHaveLength(0);
  });
});
