import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Version,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { UsersService } from './users.service';
import { UpdateProfileDto, AdminUpdateUserDto } from './dto/update-user.dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UserRole } from '@prisma/client';

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(user.sub, dto);
  }

  @Get()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '[Admin] List all users' })
  listUsers(@Query() pagination: PaginationDto) {
    return this.usersService.listUsers(pagination);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '[Admin] Update user status or role' })
  adminUpdate(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.usersService.adminUpdateUser(id, dto);
  }
}
