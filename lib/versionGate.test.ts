import { compareVersions } from './versionGate';

describe('compareVersions', () => {
  it('returns 0 for identical versions', () => {
    expect(compareVersions('1.4.5', '1.4.5')).toBe(0);
    expect(compareVersions('0.0.0', '0.0.0')).toBe(0);
    expect(compareVersions('10.20.30', '10.20.30')).toBe(0);
  });

  it('returns 1 when a is newer than b', () => {
    expect(compareVersions('1.4.5', '1.4.4')).toBe(1);
    expect(compareVersions('1.5.0', '1.4.99')).toBe(1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  });

  it('returns -1 when a is older than b', () => {
    expect(compareVersions('1.4.4', '1.4.5')).toBe(-1);
    expect(compareVersions('1.4.99', '1.5.0')).toBe(-1);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
  });

  it('compares numerically, not lexicographically', () => {
    // String-comparison would put '1.4.9' after '1.4.10'. Numeric comparison
    // correctly identifies 1.4.10 as newer. This is the bug guard: we had
    // this exact issue in a previous project.
    expect(compareVersions('1.4.10', '1.4.9')).toBe(1);
    expect(compareVersions('1.4.9', '1.4.10')).toBe(-1);
    expect(compareVersions('2.10.0', '2.9.99')).toBe(1);
  });

  it('treats missing segments as 0', () => {
    expect(compareVersions('1.4', '1.4.0')).toBe(0);
    expect(compareVersions('1', '1.0.0')).toBe(0);
    expect(compareVersions('1.5', '1.4.99')).toBe(1);
  });

  it('treats non-numeric segments as 0 (fail-soft on malformed input)', () => {
    expect(compareVersions('1.4.x', '1.4.0')).toBe(0);
    expect(compareVersions('abc', '0.0.0')).toBe(0);
    // 1.5.x is treated as 1.5.0, which is > 1.4.99
    expect(compareVersions('1.5.x', '1.4.99')).toBe(1);
  });

  it('handles the exact Downtown Vibes version comparison case', () => {
    // 1.4.4 was live with the blank-map bug; 1.4.5 is the hotfix.
    // A user on 1.4.4 should be flagged as "below 1.4.5 latest."
    expect(compareVersions('1.4.4', '1.4.5')).toBe(-1);
    // A user on 1.4.5 should be "at latest."
    expect(compareVersions('1.4.5', '1.4.5')).toBe(0);
    // A future user on 1.5.0 should be "ahead of 1.4.5 latest" — this
    // handles the brief window between a release and Dylan updating the
    // Supabase row. No modal should fire in this case.
    expect(compareVersions('1.5.0', '1.4.5')).toBe(1);
  });
});
