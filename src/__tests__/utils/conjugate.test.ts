import { conjugateEmoteForSender, conjugateEmoteForOthers } from '../../utils/conjugate';

describe('conjugate', () => {

  // ─── conjugateEmoteForSender ────────────────────────────────────────────────
  // Converts the first word to base (infinitive) form so the sender reads
  // "You wave hello" rather than "You waves hello".

  describe('conjugateEmoteForSender', () => {
    it('returns empty string unchanged', () => {
      expect(conjugateEmoteForSender('')).toBe('');
    });

    it('strips a trailing -s (regular verb)', () => {
      expect(conjugateEmoteForSender('waves')).toBe('wave');
    });

    it('strips a trailing -s from a single-word emote', () => {
      expect(conjugateEmoteForSender('bows')).toBe('bow');
    });

    it('leaves a verb already in base form unchanged', () => {
      expect(conjugateEmoteForSender('wave')).toBe('wave');
    });

    it('converts -ies ending back to -y (studies → study)', () => {
      expect(conjugateEmoteForSender('studies')).toBe('study');
    });

    it('converts sibilant -es ending back to base (reaches → reach)', () => {
      expect(conjugateEmoteForSender('reaches')).toBe('reach');
    });

    it('converts sibilant -es for -x (fixes → fix)', () => {
      expect(conjugateEmoteForSender('fixes')).toBe('fix');
    });

    it('converts sibilant -es for -sh (pushes → push)', () => {
      expect(conjugateEmoteForSender('pushes')).toBe('push');
    });

    it('converts sibilant -es for -z (buzzes → buzz)', () => {
      expect(conjugateEmoteForSender('buzzes')).toBe('buzz');
    });

    it('handles the irregular "is" → "be"', () => {
      expect(conjugateEmoteForSender('is')).toBe('be');
    });

    it('handles the irregular "has" → "have"', () => {
      expect(conjugateEmoteForSender('has')).toBe('have');
    });

    it('handles the irregular "does" → "do"', () => {
      expect(conjugateEmoteForSender('does')).toBe('do');
    });

    it('handles the irregular "goes" → "go"', () => {
      expect(conjugateEmoteForSender('goes')).toBe('go');
    });

    it('only converts the first word, leaving the rest intact', () => {
      expect(conjugateEmoteForSender('waves hello warmly')).toBe('wave hello warmly');
    });

    it('handles multi-word emote with irregular verb', () => {
      expect(conjugateEmoteForSender('goes to the door')).toBe('go to the door');
    });

    it('handles multi-word emote with base-form verb', () => {
      expect(conjugateEmoteForSender('laugh loudly')).toBe('laugh loudly');
    });
  });

  // ─── conjugateEmoteForOthers ────────────────────────────────────────────────
  // Converts the first word to third-person singular so observers read
  // "Alice waves hello" rather than "Alice wave hello".

  describe('conjugateEmoteForOthers', () => {
    it('returns empty string unchanged', () => {
      expect(conjugateEmoteForOthers('')).toBe('');
    });

    it('adds -s to a regular base-form verb (wave → waves)', () => {
      expect(conjugateEmoteForOthers('wave')).toBe('waves');
    });

    it('leaves an already-third-person verb correct (waves → waves)', () => {
      expect(conjugateEmoteForOthers('waves')).toBe('waves');
    });

    it('adds -es to a sibilant verb (reach → reaches)', () => {
      expect(conjugateEmoteForOthers('reach')).toBe('reaches');
    });

    it('adds -es to -x verb (fix → fixes)', () => {
      expect(conjugateEmoteForOthers('fix')).toBe('fixes');
    });

    it('adds -es to -sh verb (push → pushes)', () => {
      expect(conjugateEmoteForOthers('push')).toBe('pushes');
    });

    it('converts -y to -ies for consonant-y verb (study → studies)', () => {
      expect(conjugateEmoteForOthers('study')).toBe('studies');
    });

    it('adds -s (not -ies) for vowel-y verb (play → plays)', () => {
      expect(conjugateEmoteForOthers('play')).toBe('plays');
    });

    it('handles the irregular "be" → "is"', () => {
      expect(conjugateEmoteForOthers('be')).toBe('is');
    });

    it('handles the irregular "is" (via base "be") → "is"', () => {
      expect(conjugateEmoteForOthers('is')).toBe('is');
    });

    it('handles the irregular "have" → "has"', () => {
      expect(conjugateEmoteForOthers('have')).toBe('has');
    });

    it('handles the irregular "do" → "does"', () => {
      expect(conjugateEmoteForOthers('do')).toBe('does');
    });

    it('handles the irregular "go" → "goes"', () => {
      expect(conjugateEmoteForOthers('go')).toBe('goes');
    });

    it('only converts the first word, leaving the rest intact', () => {
      expect(conjugateEmoteForOthers('wave hello warmly')).toBe('waves hello warmly');
    });

    it('handles multi-word emote with irregular verb', () => {
      expect(conjugateEmoteForOthers('go to the door')).toBe('goes to the door');
    });

    it('handles multi-word emote with already-third-person verb', () => {
      expect(conjugateEmoteForOthers('laughs loudly')).toBe('laughs loudly');
    });

    it('round-trips: sender base form becomes valid third-person for others', () => {
      const sender = conjugateEmoteForSender('waves at you');
      const others = conjugateEmoteForOthers(sender);
      expect(others).toBe('waves at you');
    });
  });
});
