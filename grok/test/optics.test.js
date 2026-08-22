import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LINES,
  angularDispersion,
  bandOf,
  formatOpticsStatus,
  blazeAngleFor,
  blazeEfficiency,
  deltaLambda,
  detectorHit,
  diffractionAngle,
  diffractedDirection,
  freeSpectralRange,
  fromDeg,
  groovePitchMeters,
  illuminatedGrooves,
  missingEvenOrders,
  nmOf,
  ordersFor,
  ordersOverlap,
  rayHitsDisk,
  rayHitsSphere,
  resolvingPower,
  sinDiffraction,
  thetaIFrom,
  toDeg,
  visibleOrders,
  wavelengthMeters,
  wavelengthToRgb,
} from '../src/optics/grating.js';

function pitch(linesPerMm) {
  return groovePitchMeters(linesPerMm);
}

describe('diffraction grating kernel', () => {
  it('converts groove density and wavelength into meters', () => {
    assert.ok(Math.abs(pitch(600) - 1e-3 / 600) < 1e-15);
    assert.equal(wavelengthMeters(532), 532e-9);
    assert.equal(groovePitchMeters(0), null);
    assert.equal(wavelengthMeters(-2), null);
  });

  it('matches textbook first-order angles at 600 /mm', () => {
    const d = pitch(600);
    const green = diffractionAngle(d, wavelengthMeters(532), 1, 0);
    assert.ok(green != null);
    assert.ok(Math.abs(toDeg(green) - 18.60) < 0.05);
    const red = diffractionAngle(d, wavelengthMeters(633), 1, 0);
    assert.ok(Math.abs(toDeg(red) - 22.31) < 0.05);
  });

  it('returns null for an evanescent 633 nm first order at 1800 /mm', () => {
    const d = pitch(1800);
    assert.equal(diffractionAngle(d, wavelengthMeters(633), 1, 0), null);
    const sinM = sinDiffraction(d, wavelengthMeters(633), 1, 0);
    assert.ok(Math.abs(sinM) > 1);
  });

  it('keeps reflection m=0 as the specular mirror', () => {
    for (const deg of [-40, 0, 25]) {
      const i = fromDeg(deg);
      const theta = diffractionAngle(pitch(600), wavelengthMeters(532), 0, i);
      assert.ok(Math.abs(theta + i) < 1e-9);
    }
    const through = diffractionAngle(pitch(600), wavelengthMeters(532), 0, fromDeg(12), { mode: 'transmit' });
    assert.ok(Math.abs(toDeg(through) - 12) < 1e-6);
  });

  it('splits sodium D1/D2 by about 0.06 deg at 1200 /mm', () => {
    const d = pitch(1200);
    const d1 = diffractionAngle(d, wavelengthMeters(LINES.sodiumD1), 1, 0);
    const d2 = diffractionAngle(d, wavelengthMeters(LINES.sodiumD2), 1, 0);
    assert.ok(d1 != null && d2 != null);
    const split = Math.abs(toDeg(d1) - toDeg(d2));
    assert.ok(split > 0.05 && split < 0.07, `sodium split ${split}`);
  });

  it('recovers Littrow blaze from 2 d sin(theta_B) = m lambda', () => {
    const d = pitch(600);
    const thetaB = blazeAngleFor(d, wavelengthMeters(600), 1);
    assert.ok(thetaB != null);
    assert.ok(Math.abs(toDeg(thetaB) - 10.37) < 0.05);
    const lambdaB = 2 * d * Math.sin(fromDeg(17.45));
    assert.ok(Math.abs(lambdaB * 1e9 - 1000) < 2);
  });

  it('peaks blaze efficiency at Littrow and drops on the opposite order', () => {
    const thetaB = fromDeg(10.37);
    const on = blazeEfficiency(thetaB, thetaB, thetaB);
    const opposite = blazeEfficiency(thetaB, -thetaB, thetaB);
    assert.ok(on > 0.8);
    assert.ok(opposite < 0.3);
    assert.ok(on >= 0 && opposite >= 0);
  });

  it('computes Balmer first-order angles at 600 /mm', () => {
    const d = pitch(600);
    const ha = diffractionAngle(d, wavelengthMeters(LINES.hAlpha), 1, 0);
    const hd = diffractionAngle(d, wavelengthMeters(LINES.hDelta), 1, 0);
    assert.ok(Math.abs(toDeg(ha) - 23.18) < 0.08);
    assert.ok(Math.abs(toDeg(hd) - 14.25) < 0.08);
  });

  it('gives FSR, resolving power, and delta-lambda from m N', () => {
    assert.ok(Math.abs(freeSpectralRange(532, 15) - 532 / 15) < 1e-9);
    assert.equal(freeSpectralRange(532, 0), Infinity);
    assert.equal(resolvingPower(1, 1000), 1000);
    assert.ok(Math.abs(deltaLambda(589, 1000) - 0.589) < 0.001);
    const n = illuminatedGrooves(600, 0.04);
    assert.ok(Math.abs(n - 24000) < 1e-6);
  });

  it('detects order overlap when m lambda is degenerate', () => {
    assert.equal(ordersOverlap(400, 2, 800, 1), true);
    assert.equal(ordersOverlap(532, 1, 532, 2), false);
  });

  it('omits evanescent orders from the propagating list', () => {
    const list = visibleOrders(pitch(1800), wavelengthMeters(633), 0, 4);
    assert.equal(list.some((entry) => entry.m === 1), false);
    assert.equal(list.some((entry) => entry.m === 0), true);
  });

  it('flags missing even orders near 50% duty cycle', () => {
    assert.equal(missingEvenOrders(0.5), true);
    assert.equal(missingEvenOrders(0.32), false);
    const skipped = ordersFor(pitch(600), wavelengthMeters(532), 0, 4, { skipEven: true });
    assert.equal(skipped.some((entry) => entry.m === 2), false);
    assert.equal(skipped.some((entry) => entry.m === 1), true);
  });

  it('maps visible wavelengths to rgb and flags UV/IR', () => {
    const green = wavelengthToRgb(532);
    assert.equal(green.band, 'visible');
    assert.ok(green.g > green.r && green.g > green.b);
    const ha = wavelengthToRgb(656.3);
    assert.ok(ha.r > ha.g && ha.r > ha.b);
    const blue = wavelengthToRgb(445);
    assert.ok(blue.b > blue.r);
    const uv = wavelengthToRgb(365);
    assert.equal(uv.band, 'uv');
    assert.equal(uv.r + uv.g + uv.b, 0);
    const ir = wavelengthToRgb(850);
    assert.equal(ir.band, 'ir');
    assert.equal(bandOf(532), 'visible');
  });

  it('looks up named lines', () => {
    assert.equal(nmOf('ndyag532'), 532);
    assert.equal(nmOf(633), 633);
    assert.equal(nmOf('hAlpha'), 656.3);
  });

  it('builds a signed incidence angle and a diffracted direction', () => {
    const i = thetaIFrom([0, 0, -1], [0, 0, 1], [1, 0, 0]);
    assert.ok(Math.abs(i) < 1e-6);
    const dir = diffractedDirection([0, 0, 1], [1, 0, 0], fromDeg(18.6));
    assert.ok(dir[0] > 0.3);
    assert.ok(dir[2] > 0.8);
  });

  it('hits a disk detector only for the matching order and lambda', () => {
    const origin = [0, 0, 0];
    const direction = [0, 0, 1];
    const center = [0, 0, 4];
    const normal = [0, 0, -1];
    assert.equal(rayHitsDisk(origin, direction, center, normal, 0.3), true);
    assert.equal(rayHitsDisk(origin, [1, 0, 0], center, normal, 0.3), false);
    assert.equal(rayHitsSphere(origin, direction, center, 0.4), true);
    assert.equal(detectorHit({
      origin, direction, center, normal, radius: 0.3,
      order: 1, lambdaNm: 532, wantOrder: 1, wantNm: 532,
    }), true);
    assert.equal(detectorHit({
      origin, direction, center, normal, radius: 0.3,
      order: 0, lambdaNm: 532, wantOrder: 1, wantNm: 532,
    }), false);
    assert.equal(detectorHit({
      origin, direction, center, normal, radius: 0.3,
      order: 1, lambdaNm: 633, wantOrder: 1, wantNm: 532, lambdaTolNm: 8,
    }), false);
  });

  it('does not explode angular dispersion at grazing', () => {
    const d = pitch(600);
    const grazing = angularDispersion(d, fromDeg(89.99), 1);
    assert.equal(grazing, 0);
    const mid = angularDispersion(d, fromDeg(18.6), 1);
    assert.ok(mid > 0);
  });

  it('prints a HUD line that matches the 532 nm first-order angle', () => {
    const line = formatOpticsStatus({
      linesPerMm: 600,
      mode: 'reflect',
      lambdaNm: 532,
      thetaI: 0,
      order: 1,
    });
    assert.match(line, /600 \/mm/);
    assert.match(line, /18\.6/);
    assert.match(line, /532nm/);
    const dark = formatOpticsStatus({ linesPerMm: 1800, lambdaNm: 633, thetaI: 0, order: 1 });
    assert.match(dark, /evanescent/);
    const idle = formatOpticsStatus({ linesPerMm: 600, lambdaNm: null });
    assert.match(idle, /NO SOURCE/);
  });

  it('never imports three or constructs a renderer', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/optics/grating.js', import.meta.url), 'utf8'));
    assert.equal(src.includes('three'), false);
    assert.equal(src.includes('WebGLRenderer'), false);
  });
});
