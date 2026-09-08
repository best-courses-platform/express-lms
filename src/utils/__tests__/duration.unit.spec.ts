import { describe, it, expect } from '@jest/globals';
import { parseDurationMs } from '../duration';

describe('parseDurationMs', () => {
  it.each([
    ['15m', 15 * 60 * 1000],
    ['8h', 8 * 60 * 60 * 1000],
    ['30d', 30 * 24 * 60 * 60 * 1000],
    ['900s', 900 * 1000],
    ['500ms', 500],
  ])('%s → %d мс', (value, expected) => {
    expect(parseDurationMs(value)).toBe(expected);
  });

  it('без суффикса — трактует число как секунды (соответствует jsonwebtoken/ms)', () => {
    expect(parseDurationMs('900')).toBe(900 * 1000);
  });

  it('обрезает пробелы по краям', () => {
    expect(parseDurationMs('  15m  ')).toBe(15 * 60 * 1000);
  });

  it.each(['', 'abc', '15x', '-5m', '15 m', '15.5m'])('бросает понятную ошибку на "%s"', value => {
    expect(() => parseDurationMs(value)).toThrow(/Некорректная длительность/);
  });
});
