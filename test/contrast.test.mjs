import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apcaContrastLc,
  compositeOver,
  compositeStack,
  parseColor,
  rgbToHex,
  suggestAccessibleColor,
  wcagContrastRatio,
} from '../src/color/contrast.mjs';

test('parseColor parses rgb, rgba, and hex formats', () => {
  assert.deepEqual(parseColor('rgb(255, 0, 128)'), { r: 255, g: 0, b: 128, a: 1 });
  assert.deepEqual(parseColor('rgba(15, 23, 42, 0.5)'), { r: 15, g: 23, b: 42, a: 0.5 });
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('#1d4ed8'), { r: 29, g: 78, b: 216, a: 1 });
});

test('wcagContrastRatio matches W3C reference values', () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  assert.equal(Math.round(wcagContrastRatio(black, white) * 100) / 100, 21);
  assert.equal(Math.round(wcagContrastRatio(white, white) * 100) / 100, 1);
});

test('compositeOver & compositeStack blend translucent layers accurately', () => {
  const halfBlack = { r: 0, g: 0, b: 0, a: 0.5 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const blended = compositeOver(halfBlack, white);
  assert.equal(blended.r, 128);
  assert.equal(blended.g, 128);
  assert.equal(blended.b, 128);

  const stacked = compositeStack([halfBlack], white);
  assert.equal(rgbToHex(stacked), '#808080');
});

test('apcaContrastLc distinguishes polarity (BoW positive, WoB negative)', () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  assert.ok(apcaContrastLc(black, white) > 100);
  assert.ok(apcaContrastLc(white, black) < -100);
});

test('suggestAccessibleColor produces hue-preserving color passing target ratio', () => {
  const weakBlue = { r: 147, g: 197, b: 253, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const suggestion = suggestAccessibleColor(weakBlue, white, 4.5);
  assert.ok(suggestion.ratio >= 4.5, `expected >= 4.5, got ${suggestion.ratio}`);
  const parsed = parseColor(suggestion.hex);
  assert.ok(parsed.b > parsed.r, 'expected hue to remain blue');
});
