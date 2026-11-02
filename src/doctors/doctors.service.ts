import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserRole, ConsultationMode, Prisma } from '@prisma/client';

import { PrismaService } from '../infra/prisma.service';
import { RedisService } from '../infra/redis.service';
import { CreateDoctorDto, UpdateDoctorDto, SearchDoctorsDto } from './dto/doctor.dto';
import { paginate } from '../common/dto/pagination.dto';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

const SEARCH_CACHE_TTL = 60; // seconds

@Injectable()
export class DoctorsService {
  private readonly logger = new Logger(DoctorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createDoctor(dto: CreateDoctorDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: UserRole.doctor,
        emailVerified: true,
        profile: {
          create: { firstName: dto.firstName, lastName: dto.lastName },
        },
        doctor: {
          create: {
            specialties: dto.specialties ?? [],
            yearsExperience: dto.yearsExperience ?? 0,
            consultationFeeCents: dto.consultationFeeCents ?? 0,
            mode: dto.mode ?? ConsultationMode.online,
            bio: dto.bio,
          },
        },
      },
      include: { profile: true, doctor: true },
    });

    this.logger.log({ userId: user.id }, 'Doctor created by admin');
    const { passwordHash: _, mfaSecret: __, ...safe } = user;
    return safe;
  }

  async getDoctorById(id: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: {
        user: { include: { profile: true }, select: { id: true, email: true, status: true, profile: true } },
      },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  async updateDoctor(id: string, dto: UpdateDoctorDto, requesterId: string, requesterRole: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    // Only admin can set verified; doctors can update their own profile
    if (requesterRole !== 'admin' && doctor.userId !== requesterId) {
      throw new ForbiddenException('You can only update your own profile');
    }
    if (dto.verified !== undefined && requesterRole !== 'admin') {
      throw new ForbiddenException('Only admins can change verified status');
    }

    await this.invalidateSearchCache();
    return this.prisma.doctor.update({
      where: { id },
      data: {
        ...(dto.specialties !== undefined && { specialties: dto.specialties }),
        ...(dto.yearsExperience !== undefined && { yearsExperience: dto.yearsExperience }),
        ...(dto.consultationFeeCents !== undefined && { consultationFeeCents: dto.consultationFeeCents }),
        ...(dto.mode !== undefined && { mode: dto.mode }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.verified !== undefined && { verified: dto.verified }),
      },
    });
  }

  async searchDoctors(dto: SearchDoctorsDto) {
    const cacheKey = `doctors:search:${JSON.stringify(dto)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ReturnType<typeof paginate>;
    }

    const where = {
      verified: true,
      user: { status: { equals: 'active' as const } },
      ...(dto.specialty && { specialties: { has: dto.specialty } }),
      ...(dto.mode && dto.mode !== ConsultationMode.both && { mode: { in: [dto.mode, ConsultationMode.both] } }),
      ...(dto.feeMin !== undefined && { consultationFeeCents: { gte: dto.feeMin } }),
      ...(dto.feeMax !== undefined && { consultationFeeCents: { lte: dto.feeMax } }),
      ...(dto.q && {
        OR: [
          { bio: { contains: dto.q, mode: Prisma.QueryMode.insensitive } },
          { user: { profile: { firstName: { contains: dto.q, mode: Prisma.QueryMode.insensitive } } } },
          { user: { profile: { lastName: { contains: dto.q, mode: Prisma.QueryMode.insensitive } } } },
        ] as Prisma.DoctorWhereInput[],
      }),
    };

    const [doctors, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: [{ rating: 'desc' }, { yearsExperience: 'desc' }],
        include: { user: { include: { profile: true } } },
      }),
      this.prisma.doctor.count({ where }),
    ]);

    const result = paginate(doctors, total, dto);
    await this.redis.setex(cacheKey, SEARCH_CACHE_TTL, JSON.stringify(result));
    return result;
  }

  private async invalidateSearchCache() {
    const keys = await this.redis.keys('doctors:search:*');
    if (keys.length) await this.redis.del(...keys);
  }
}
