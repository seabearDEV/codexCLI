import { describe, it, expect } from 'vitest';
import {
  HANDOFF_KEY,
  HANDOFF_STALE_DAYS,
  buildHandoffBanner,
  formatHandoffAge,
} from '../utils/handoff';

describe('formatHandoffAge', () => {
  it('returns "just now" for sub-minute ages', () => {
    expect(formatHandoffAge(0)).toBe('just now');
    expect(formatHandoffAge(59_999)).toBe('just now');
  });

  it('formats minutes under an hour', () => {
    expect(formatHandoffAge(60_000)).toBe('1m ago');
    expect(formatHandoffAge(30 * 60_000)).toBe('30m ago');
    expect(formatHandoffAge(59 * 60_000)).toBe('59m ago');
  });

  it('formats hours under a day', () => {
    expect(formatHandoffAge(60 * 60_000)).toBe('1h ago');
    expect(formatHandoffAge(3 * 60 * 60_000)).toBe('3h ago');
    expect(formatHandoffAge(23 * 60 * 60_000)).toBe('23h ago');
  });

  it('formats days beyond that', () => {
    expect(formatHandoffAge(24 * 60 * 60_000)).toBe('1d ago');
    expect(formatHandoffAge(7 * 24 * 60 * 60_000)).toBe('7d ago');
    expect(formatHandoffAge(42 * 24 * 60 * 60_000)).toBe('42d ago');
  });
});

describe('buildHandoffBanner', () => {
  const now = Date.UTC(2026, 3, 23, 12, 0, 0);

  it('returns undefined when the handoff key is absent', () => {
    const result = buildHandoffBanner({ 'project.name': 'foo' }, {}, now);
    expect(result).toBeUndefined();
  });

  it('renders a single-line handoff with age', () => {
    const threeHoursAgo = now - 3 * 60 * 60_000;
    const result = buildHandoffBanner(
      { [HANDOFF_KEY]: 'Picked up from the #91 design; ready to code.' },
      { [HANDOFF_KEY]: threeHoursAgo },
      now,
    );
    expect(result).toBeDefined();
    expect(result!.lines[0]).toBe('→ Handoff from previous session (3h ago):');
    expect(result!.lines[1]).toBe('  Picked up from the #91 design; ready to code.');
    expect(result!.isStale).toBe(false);
    expect(result!.ageDays).toBe(0);
  });

  it('indents each line of a multi-line handoff', () => {
    const fifteenMinAgo = now - 15 * 60_000;
    const value = 'Line 1\nLine 2\nLine 3';
    const result = buildHandoffBanner(
      { [HANDOFF_KEY]: value },
      { [HANDOFF_KEY]: fifteenMinAgo },
      now,
    );
    expect(result!.lines).toEqual([
      '→ Handoff from previous session (15m ago):',
      '  Line 1',
      '  Line 2',
      '  Line 3',
    ]);
  });

  it('marks handoff stale at the 7-day threshold', () => {
    const sevenDaysAgo = now - HANDOFF_STALE_DAYS * 24 * 60 * 60_000;
    const result = buildHandoffBanner(
      { [HANDOFF_KEY]: 'old note' },
      { [HANDOFF_KEY]: sevenDaysAgo },
      now,
    );
    expect(result!.isStale).toBe(true);
    expect(result!.ageDays).toBe(7);
    expect(result!.lines[0]).toBe('→ Handoff from previous session (7d ago) [likely stale — 7d]:');
  });

  it('does not mark stale at 6 days', () => {
    const sixDaysAgo = now - 6 * 24 * 60 * 60_000;
    const result = buildHandoffBanner(
      { [HANDOFF_KEY]: 'recent-ish' },
      { [HANDOFF_KEY]: sixDaysAgo },
      now,
    );
    expect(result!.isStale).toBe(false);
    expect(result!.lines[0]).toBe('→ Handoff from previous session (6d ago):');
  });

  it('labels untracked handoffs but does not mark them stale', () => {
    // No meta timestamp → we genuinely don't know the age.
    const result = buildHandoffBanner(
      { [HANDOFF_KEY]: 'hand-edited note' },
      {},
      now,
    );
    expect(result!.isStale).toBe(false);
    expect(result!.ageDays).toBeUndefined();
    expect(result!.lines[0]).toBe('→ Handoff from previous session (untracked):');
  });
});
