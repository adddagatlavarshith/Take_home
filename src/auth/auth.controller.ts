import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Version,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import {
  RegisterDto,
} from './dto/register.dto';
import {
  LoginDto,
  LoginMfaDto,
  RefreshTokenDto,
  MfaSetupDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
} from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new patient account' })
  @ApiResponse({ status: 201, description: 'Returns access + refresh tokens' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login and obtain tokens (may require MFA)' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('login/mfa')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Complete login with TOTP code' })
  async loginMfa(@Body() dto: LoginMfaDto) {
    return this.authService.loginMfa(dto.challengeId, dto.totpCode);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke refresh tokens (logout)' })
  async logout(@CurrentUser() user: JwtPayload) {
    await this.authService.logout(user.sub);
  }

  @Post('mfa/setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate TOTP MFA setup — returns OTP auth URL' })
  async setupMfa(@CurrentUser() user: JwtPayload) {
    return this.authService.setupMfa(user.sub);
  }

  @Post('mfa/verify-setup')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm TOTP code to activate MFA' })
  async verifySetup(@CurrentUser() user: JwtPayload, @Body() dto: MfaSetupDto) {
    return this.authService.verifyMfaSetup(user.sub, dto.totpCode);
  }

  @Post('mfa/disable')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable MFA (patient only, confirm with TOTP code)' })
  async disableMfa(@CurrentUser() user: JwtPayload, @Body() dto: MfaSetupDto) {
    return this.authService.disableMfa(user.sub, dto.totpCode);
  }

  @Post('password/reset-request')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Request a password reset token' })
  async resetRequest(@Body() dto: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('password/reset-confirm')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm password reset with token' })
  async resetConfirm(@Body() dto: PasswordResetConfirmDto) {
    if (!dto.newPassword) {
      throw new Error('newPassword is required');
    }
    return this.authService.confirmPasswordReset(dto.token, dto.newPassword);
  }
}
