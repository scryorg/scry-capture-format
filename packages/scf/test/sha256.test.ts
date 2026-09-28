import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/sha256.js';

const enc = new TextEncoder();

// Vectors cross-checked against `sha256sum` (coreutils), not typed from memory.
describe('sha256Hex', () => {
  it('sha256("")', () => {
    expect(sha256Hex(enc.encode(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('sha256("abc")', () => {
    expect(sha256Hex(enc.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('sha256 of a 56-byte multi-word message', () => {
    expect(sha256Hex(enc.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );
  });

  it('sha256 of 1000 repeated bytes (spans multiple 64-byte blocks)', () => {
    expect(sha256Hex(enc.encode('x'.repeat(1000)))).toBe(
      '44f8354494a5ba03ba1792a8d3e9c534c47a9181980fde7a3f44b06ef2ae7c7f'
    );
  });

  it('is deterministic for the same input', () => {
    const bytes = enc.encode('Components/Button--Primary');
    expect(sha256Hex(bytes)).toBe(sha256Hex(bytes));
  });
});
