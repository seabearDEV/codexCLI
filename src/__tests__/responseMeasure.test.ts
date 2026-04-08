import {
  startResponseMeasure,
  addResponseBytes,
  endResponseMeasure,
} from '../utils/responseMeasure';

describe('responseMeasure', () => {
  // Each test starts from a clean slate. The state machine is module-level
  // so we need explicit reset semantics — calling endResponseMeasure() at
  // the top of every test ensures any leftover state from a prior failed
  // test is cleared.
  beforeEach(() => {
    endResponseMeasure();
  });

  it('returns undefined when no measurement is active', () => {
    expect(endResponseMeasure()).toBeUndefined();
  });

  it('addResponseBytes is a no-op when no measurement is active', () => {
    addResponseBytes(100);
    addResponseBytes(50);
    expect(endResponseMeasure()).toBeUndefined();
  });

  it('returns the accumulated count after start + add + end', () => {
    startResponseMeasure();
    addResponseBytes(10);
    addResponseBytes(20);
    addResponseBytes(30);
    expect(endResponseMeasure()).toBe(60);
  });

  it('returns 0 when measurement was started but no bytes were added', () => {
    startResponseMeasure();
    expect(endResponseMeasure()).toBe(0);
  });

  it('resets between measurements', () => {
    startResponseMeasure();
    addResponseBytes(100);
    expect(endResponseMeasure()).toBe(100);

    startResponseMeasure();
    addResponseBytes(7);
    expect(endResponseMeasure()).toBe(7);
  });

  it('a second endResponseMeasure() after the first returns undefined', () => {
    startResponseMeasure();
    addResponseBytes(50);
    expect(endResponseMeasure()).toBe(50);
    expect(endResponseMeasure()).toBeUndefined();
  });

  it('a second startResponseMeasure() resets the counter', () => {
    startResponseMeasure();
    addResponseBytes(99);
    // No endResponseMeasure here — restart mid-flight
    startResponseMeasure();
    addResponseBytes(1);
    expect(endResponseMeasure()).toBe(1);
  });
});
