import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';
import { UpdateProfileDto, AdminUpdateUserDto } from './dto/update-user.dto';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash: _, mfaSecret: __, ...safe } = user;
    return safe;
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        firstName: dto.firstName ?? '',
        lastName: dto.lastName ?? '',
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        gender: dto.gender,
      },
      update: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.dateOfBirth !== undefined && { dateOfBirth: new Date(dto.dateOfBirth) }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
      },
    });
    return this.getMe(userId);
  }

  async listUsers(pagination: PaginationDto) {
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);
    const safe = users.map(({ passwordHash: _, mfaSecret: __, ...u }) => u);
    return paginate(safe, total, pagination);
  }

  async adminUpdateUser(userId: string, dto: AdminUpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { ...(dto.status && { status: dto.status }) },
      select: { id: true, email: true, role: true, status: true, updatedAt: true },
    });
  }
}
