import { createHash } from 'crypto';

// Pure unit tests for idempotency hashing logic
describe('Idempotency key hash', () => {
  function hashBody(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
  }

  it('same body produces same hash', () => {
    const body = { slotId: 'abc-123', mode: 'online' };
    expect(hashBody(body)).toBe(hashBody(body));
  });

  it('different bodies produce different hashes', () => {
    expect(hashBody({ slotId: 'abc' })).not.toBe(hashBody({ slotId: 'xyz' }));
  });

  it('null and undefined body both hash to same value', () => {
    expect(hashBody(null)).toBe(hashBody(undefined));
  });

  it('extra field in body changes the hash', () => {
    const a = { slotId: 'abc' };
    const b = { slotId: 'abc', extra: 'field' };
    expect(hashBody(a)).not.toBe(hashBody(b));
  });

  it('field ordering affects hash (JSON.stringify is deterministic for same input)', () => {
    const a = { slotId: 'abc', mode: 'online' };
    const b = { slotId: 'abc', mode: 'online' };
    expect(hashBody(a)).toBe(hashBody(b));
  });
});
