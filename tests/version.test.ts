import { describe, expect, it } from 'vitest';
import { isNewerVersion } from '../src/shared/types';

/**
 * The version comparison of the update button. Comparing strings plainly
 * ("1.10.0" < "1.9.0" alphabetically) is exactly the bug this avoids.
 */
describe('isNewerVersion', () => {
  it('detects a later version', () => {
    expect(isNewerVersion('1.5.0', '1.4.0')).toBe(true);
    expect(isNewerVersion('1.4.1', '1.4.0')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });

  it('the same version is not newer', () => {
    expect(isNewerVersion('1.4.0', '1.4.0')).toBe(false);
  });

  it('an earlier version is not newer', () => {
    expect(isNewerVersion('1.3.0', '1.4.0')).toBe(false);
    expect(isNewerVersion('1.4.0', '1.4.1')).toBe(false);
  });

  it('compares by number, not alphabetically', () => {
    // The classic case: 1.10.0 is later than 1.9.0 even though "1" < "9" as text.
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(true);
    expect(isNewerVersion('1.9.0', '1.10.0')).toBe(false);
  });

  it('tolerates the leading "v" of git tags', () => {
    expect(isNewerVersion('v1.5.0', 'v1.4.0')).toBe(true);
    expect(isNewerVersion('v1.4.0', '1.4.0')).toBe(false);
  });

  it('ignores pre-release suffixes by falling back to the base', () => {
    expect(isNewerVersion('1.5.0-beta', '1.4.0')).toBe(true);
    expect(isNewerVersion('1.4.0-rc1', '1.4.0')).toBe(false);
  });
});
