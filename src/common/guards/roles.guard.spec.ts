import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

function makeCtx(userRole: string | null, requiredRoles: UserRole[] | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: userRole ? { role: userRole, sub: 'u1', email: 'e', mfaVerified: false } : null }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('passes when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeCtx('patient', undefined))).toBe(true);
  });

  it('passes when user role matches required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.admin]);
    expect(guard.canActivate(makeCtx('admin', [UserRole.admin]))).toBe(true);
  });

  it('throws ForbiddenException for mismatched role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.admin]);
    expect(() => guard.canActivate(makeCtx('patient', [UserRole.admin]))).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when no user on request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.admin]);
    expect(() => guard.canActivate(makeCtx(null, [UserRole.admin]))).toThrow(ForbiddenException);
  });

  it('passes when role is in list of multiple required roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.admin, UserRole.doctor]);
    expect(guard.canActivate(makeCtx('doctor', [UserRole.admin, UserRole.doctor]))).toBe(true);
  });
});
