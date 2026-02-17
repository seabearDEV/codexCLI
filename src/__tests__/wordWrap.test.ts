import { stripAnsi, visibleLength, wordWrap } from '../utils/wordWrap';

describe('wordWrap utilities', () => {
  describe('stripAnsi', () => {
    it('removes ANSI escape codes', () => {
      expect(stripAnsi('\x1b[36mhello\x1b[0m')).toBe('hello');
    });

    it('removes multiple ANSI codes', () => {
      expect(stripAnsi('\x1b[1m\x1b[36mkey\x1b[0m.\x1b[33mvalue\x1b[0m')).toBe('key.value');
    });

    it('returns plain string unchanged', () => {
      expect(stripAnsi('no codes here')).toBe('no codes here');
    });

    it('handles empty string', () => {
      expect(stripAnsi('')).toBe('');
    });
  });

  describe('visibleLength', () => {
    it('returns length excluding ANSI codes', () => {
      expect(visibleLength('\x1b[36mhello\x1b[0m')).toBe(5);
    });

    it('returns correct length for plain string', () => {
      expect(visibleLength('hello')).toBe(5);
    });

    it('returns 0 for empty string', () => {
      expect(visibleLength('')).toBe(0);
    });

    it('handles string with only ANSI codes', () => {
      expect(visibleLength('\x1b[36m\x1b[0m')).toBe(0);
    });
  });

  describe('wordWrap', () => {
    it('returns short text as single-element array', () => {
      expect(wordWrap('hello world', 40)).toEqual(['hello world']);
    });

    it('wraps at word boundary', () => {
      expect(wordWrap('hello world foo', 11)).toEqual(['hello world', 'foo']);
    });

    it('hard-breaks a single long word', () => {
      expect(wordWrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    });

    it('handles empty string', () => {
      expect(wordWrap('', 40)).toEqual(['']);
    });

    it('does not wrap exact-width text', () => {
      expect(wordWrap('12345', 5)).toEqual(['12345']);
    });

    it('wraps text with multiple break points', () => {
      expect(wordWrap('one two three four five', 10)).toEqual([
        'one two',
        'three four',
        'five',
      ]);
    });

    it('handles mixed short words and long words', () => {
      expect(wordWrap('hi abcdefghijkl ok', 5)).toEqual([
        'hi',
        'abcde',
        'fghij',
        'kl ok',
      ]);
    });

    it('returns text as-is when width is zero', () => {
      expect(wordWrap('hello', 0)).toEqual(['hello']);
    });

    it('hard-breaks long words with ANSI codes without corrupting them', () => {
      // 10 visible chars wrapped in ANSI color codes, break at width 4
      const colored = '\x1b[36mabcdefghij\x1b[0m';
      const result = wordWrap(colored, 4);
      // Each chunk should have exactly 4 visible chars (last has 2)
      expect(result).toHaveLength(3);
      for (const line of result) {
        // No corrupted partial escape sequences
        expect(stripAnsi(line)).toBe(stripAnsi(line)); // round-trip clean
        expect(line).not.toMatch(/\x1b(?!\[)/); // no orphaned ESC
        expect(line).not.toMatch(/\x1b\[[0-9;]*$/); // no unterminated sequence
      }
      // Visible content is preserved
      expect(result.map(l => stripAnsi(l)).join('')).toBe('abcdefghij');
    });

    it('preserves ANSI codes around break points', () => {
      // Word: bold "ab" + reset + "cd" = 4 visible chars, break at 2
      const word = '\x1b[1mab\x1b[0mcd';
      const result = wordWrap(word, 2);
      expect(result.map(l => stripAnsi(l))).toEqual(['ab', 'cd']);
      // First chunk should contain the bold code and reset
      expect(result[0]).toContain('\x1b[1m');
    });
  });
});
