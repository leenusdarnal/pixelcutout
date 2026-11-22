import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

function hslToken(name) {
  const match = page.match(new RegExp('--' + name + ':\\s*hsl\\((\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%\\)'));
  assert.ok(match, 'Missing HSL token: ' + name);
  return match.slice(1).map(Number);
}

function rgbFromHsl([hue, saturation, lightness]) {
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = l - chroma / 2;
  let rgb;
  if (h < 1 / 6) rgb = [chroma, x, 0];
  else if (h < 2 / 6) rgb = [x, chroma, 0];
  else if (h < 3 / 6) rgb = [0, chroma, x];
  else if (h < 4 / 6) rgb = [0, x, chroma];
  else if (h < 5 / 6) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return rgb.map((channel) => channel + offset);
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return value;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(tokenA, tokenB) {
  const lumA = luminance(rgbFromHsl(hslToken(tokenA)));
  const lumB = luminance(rgbFromHsl(hslToken(tokenB)));
  const [lighter, darker] = [lumA, lumB].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('primary, secondary, and muted body text meet 4.5:1 on light surfaces', () => {
  for (const token of ['ink-900', 'ink-700', 'ink-600']) {
    assert.ok(contrast(token, 'surface') >= 4.5, token + ' on surface must meet 4.5:1');
  }
  for (const surface of ['surface', 'surface-2', 'white']) {
    assert.ok(contrast('ink-500', surface) >= 4.5, 'ink-500 on ' + surface + ' must meet 4.5:1');
  }
});

test('the primary action and semantic state labels meet 4.5:1', () => {
  assert.ok(contrast('white', 'blue-600') >= 4.5, 'primary button text must meet 4.5:1');
  assert.ok(contrast('blue-700', 'blue-100') >= 4.5, 'blue action text must meet 4.5:1');
  assert.ok(contrast('green-700', 'green-100') >= 4.5, 'positive state text must meet 4.5:1');
  assert.ok(contrast('red-700', 'red-100') >= 4.5, 'error text must meet 4.5:1');
});


test('keyboard focus indicators use the high-contrast primary color', () => {
  assert.match(page, /outline:\s*3px solid var\(--blue-600\)/);
});
