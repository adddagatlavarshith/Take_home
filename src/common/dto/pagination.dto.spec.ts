import { paginate, PaginationDto } from './pagination.dto';

describe('paginate()', () => {
  it('calculates skip correctly', () => {
    const dto = Object.assign(new PaginationDto(), { page: 3, limit: 10 });
    expect(dto.skip).toBe(20);
  });

  it('returns correct meta', () => {
    const dto = Object.assign(new PaginationDto(), { page: 2, limit: 5 });
    const result = paginate(['a', 'b', 'c', 'd', 'e'], 13, dto);
    expect(result.meta).toEqual({ total: 13, page: 2, limit: 5, totalPages: 3 });
  });
});
