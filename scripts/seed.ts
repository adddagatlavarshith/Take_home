/**
 * Seed script: creates 1 admin, 3 doctors, 10 patients, and 7 days of availability slots.
 * Usage: npx ts-node scripts/seed.ts
 */
import { PrismaClient, UserRole, ConsultationMode } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

const SPECIALTIES = [
  ['Cardiology', 'Internal Medicine'],
  ['Dermatology', 'Cosmetology'],
  ['Pediatrics', 'General Medicine'],
];

async function main() {
  console.log('🌱 Seeding database...');

  const adminHash = await argon2.hash('Admin@12345', ARGON2_OPTIONS);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@amrutam.test' },
    update: {},
    create: {
      email: 'admin@amrutam.test',
      passwordHash: adminHash,
      role: UserRole.admin,
      emailVerified: true,
      mfaEnabled: false,
      profile: {
        create: { firstName: 'Admin', lastName: 'User' },
      },
    },
  });
  console.log('✓ Admin:', admin.email);

  const doctors = [];
  for (let i = 0; i < 3; i++) {
    const hash = await argon2.hash(`Doctor${i + 1}@pass`, ARGON2_OPTIONS);
    const doctor = await prisma.user.upsert({
      where: { email: `doctor${i + 1}@amrutam.test` },
      update: {},
      create: {
        email: `doctor${i + 1}@amrutam.test`,
        passwordHash: hash,
        role: UserRole.doctor,
        emailVerified: true,
        mfaEnabled: false,
        profile: {
          create: { firstName: `Doctor${i + 1}`, lastName: 'Test' },
        },
        doctor: {
          create: {
            specialties: SPECIALTIES[i],
            yearsExperience: 5 + i * 3,
            consultationFeeCents: (500 + i * 200) * 100,
            mode: i === 0 ? ConsultationMode.online : i === 1 ? ConsultationMode.in_person : ConsultationMode.both,
            bio: `Experienced ${SPECIALTIES[i][0]} specialist with ${5 + i * 3} years of practice.`,
            rating: 4.5 + i * 0.1,
            verified: true,
          },
        },
      },
      include: { doctor: true },
    });
    doctors.push(doctor);
    console.log('✓ Doctor:', doctor.email);
  }

  for (let i = 0; i < 10; i++) {
    const hash = await argon2.hash(`Patient${i + 1}@pass`, ARGON2_OPTIONS);
    const patient = await prisma.user.upsert({
      where: { email: `patient${i + 1}@amrutam.test` },
      update: {},
      create: {
        email: `patient${i + 1}@amrutam.test`,
        passwordHash: hash,
        role: UserRole.patient,
        emailVerified: true,
        mfaEnabled: false,
        profile: {
          create: { firstName: `Patient${i + 1}`, lastName: 'Test' },
        },
      },
    });
    if (i === 0) console.log('✓ Patients: patient1@amrutam.test … patient10@amrutam.test');
  }

  // Create 7 days of availability rules and slots for each doctor
  for (const user of doctors) {
    const doctorRecord = (user as typeof user & { doctor: { id: string } }).doctor;
    if (!doctorRecord) continue;

    // Create weekday rules (Mon–Fri = 1–5)
    for (const weekday of [1, 2, 3, 4, 5]) {
      await prisma.availabilityRule.upsert({
        where: {
          doctorId_weekday: { doctorId: doctorRecord.id, weekday },
        },
        update: {},
        create: {
          doctorId: doctorRecord.id,
          weekday,
          startTime: '09:00',
          endTime: '17:00',
          slotDurationMin: 30,
          mode: ConsultationMode.online,
        },
      });
    }

    // Materialize 7 days of slots
    const today = new Date();
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() + d);
      const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const [startH, startM] = [9, 0];
      const [endH, endM] = [17, 0];

      let slotStart = new Date(date);
      slotStart.setHours(startH, startM, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(endH, endM, 0, 0);

      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
        if (slotEnd > dayEnd) break;

        await prisma.availabilitySlot.upsert({
          where: { doctorId_startAt: { doctorId: doctorRecord.id, startAt: slotStart } },
          update: {},
          create: {
            doctorId: doctorRecord.id,
            startAt: new Date(slotStart),
            endAt: new Date(slotEnd),
            mode: ConsultationMode.online,
            status: 'available',
          },
        });

        slotStart = slotEnd;
      }
    }

    console.log(`✓ Slots materialized for ${user.email}`);
  }

  console.log('\n🎉 Seed complete!');
  console.log('');
  console.log('Admin:   admin@amrutam.test      / Admin@12345');
  console.log('Doctors: doctor1@amrutam.test    / Doctor1@pass  (requires MFA setup)');
  console.log('         doctor2@amrutam.test    / Doctor2@pass');
  console.log('         doctor3@amrutam.test    / Doctor3@pass');
  console.log('Patient: patient1@amrutam.test   / Patient1@pass');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
