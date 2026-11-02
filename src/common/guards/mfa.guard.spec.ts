import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MfaGuard } from './mfa.guard';
import { JwtPayload } from '../decorators/current-user.decorator';

function makeCtx(mfaVerified: boolean, requireMfa: boolean | undefined): ExecutionContext {
  const user: JwtPayload = { sub: 'u1', email: 'e@e.com', role: 'doctor', mfaVerified };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('MfaGuard', () => {
  let guard: MfaGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new MfaGuard(reflector);
  });

  it('passes when requireMfa metadata is not set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeCtx(false, undefined))).toBe(true);
  });

  it('passes when mfaVerified=true', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(guard.canActivate(makeCtx(true, true))).toBe(true);
  });

  it('throws ForbiddenException when mfaVerified=false', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(() => guard.canActivate(makeCtx(false, true))).toThrow(ForbiddenException);
  });
});
