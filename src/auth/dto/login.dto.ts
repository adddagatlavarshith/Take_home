import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'patient@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'P@ssw0rd!' })
  @IsString()
  password!: string;
}

export class LoginMfaDto {
  @ApiProperty({ description: 'MFA challenge ID from initial login response' })
  @IsString()
  challengeId!: string;

  @ApiProperty({ description: '6-digit TOTP code' })
  @IsString()
  totpCode!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class MfaSetupDto {
  @ApiProperty({ description: '6-digit TOTP code to verify new MFA secret' })
  @IsString()
  totpCode!: string;
}

export class PasswordResetRequestDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  newPassword?: string;
}
