import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateQr, qrToPathD } from '../src/utils/qr-generator.js';

describe('QR Generator', () => {
  it('generates valid QR matrix for invoice URL', () => {
    const text = 'https://example.com/invoice/12345678901234567890';
    const result = generateQr(text, { level: 'M' });

    assert.equal(typeof result.version, 'number');
    assert.ok(result.version >= 1 && result.version <= 7);
    assert.equal(result.level, 'M');
    assert.equal(typeof result.mask, 'number');
    assert.ok(result.mask >= 0 && result.mask <= 7);
    assert.equal(result.size, result.version * 4 + 17);
    assert.equal(result.matrix.length, result.size);
    assert.equal(result.matrix[0].length, result.size);
  });

  it('handles different error correction levels', () => {
    const text = 'TEST-QR';
    const resL = generateQr(text, { level: 'L' });
    const resH = generateQr(text, { level: 'H' });

    assert.equal(resL.level, 'L');
    assert.equal(resH.level, 'H');
  });

  it('throws error when text exceeds maxVersion limit', () => {
    const longText = 'A'.repeat(500);
    assert.throws(() => {
      generateQr(longText, { maxVersion: 7 });
    }, /النص طويل جداً/);
  });

  it('converts matrix to SVG path string correctly', () => {
    const matrix = [
      [1, 0],
      [0, 1],
    ];
    const path = qrToPathD(matrix, 2);
    assert.equal(path, 'M0 0h2v2h-2zM2 2h2v2h-2z');
  });
});
