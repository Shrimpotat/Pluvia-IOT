// parity.test.js
// Checks that the JavaScript port (PluviaLogic.js) behaves exactly like the C++
// firmware logic that firmware/tests/test_logic.cpp asserts. Every case below is
// a line-for-line copy of an assertion from that file.
//
// Run: node parity.test.js

'use strict';

const L = require('./PluviaLogic');

const {
  NO_RAIN, RAIN, COVER_CLOSED, COVER_OPEN, MODE_AUTO, MODE_MANUAL,
  CMD_NONE, CMD_OPEN, CMD_CLOSE, RainDetector, CoverController,
} = L;

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`); }
}

// Same values as the defaults in config.h
const THRESH = 3000, HYST = 200, CONFIRM = 3;
const DRY = 120000;
const DRY_READING = 4000, WET_READING = 1200, BAND_READING = 3100;

/** One simulated device: detector + controller, 2 seconds per reading. */
class Rig {
  constructor() {
    this.det = new RainDetector(THRESH, HYST, CONFIRM);
    this.ctl = new CoverController(DRY);
    this.now = 0;
  }
  feed(reading) {
    this.now += 2000;
    if (this.det.update(reading)) return this.ctl.onRainChanged(this.det.state, this.now);
    return false;
  }
  feedN(reading, n) { for (let i = 0; i < n; i++) this.feed(reading); }
}

console.log('RainDetector');
{
  const d = new RainDetector(THRESH, HYST, CONFIRM);
  check('starts as NO_RAIN', d.state === NO_RAIN);
  check('dry readings change nothing', !d.update(4000) && !d.update(4000) && d.state === NO_RAIN);
  check('1st wet reading not confirmed', !d.update(WET_READING) && d.state === NO_RAIN);
  check('2nd wet reading not confirmed', !d.update(WET_READING) && d.state === NO_RAIN);
  check('3rd wet reading confirms RAIN', d.update(WET_READING) && d.state === RAIN);
}
{
  const d = new RainDetector(THRESH, HYST, CONFIRM);
  d.update(WET_READING); d.update(WET_READING);
  d.update(DRY_READING);
  d.update(WET_READING); d.update(WET_READING);
  check('interrupted streak does not confirm', d.state === NO_RAIN);
  check('a full new streak confirms', d.update(WET_READING) && d.state === RAIN);
}
{
  const d = new RainDetector(THRESH, HYST, CONFIRM);
  for (let i = 0; i < 3; i++) d.update(WET_READING);
  let changed = false;
  for (let i = 0; i < 10; i++) changed = changed || d.update(BAND_READING);
  check('reading inside hysteresis band keeps RAIN', !changed && d.state === RAIN);
  d.update(3201); d.update(3201);
  check('two dry readings are not enough to end rain', d.state === RAIN);
  check('third reading above threshold+hysteresis ends rain', d.update(3201) && d.state === NO_RAIN);
}
{
  const d = new RainDetector(THRESH, HYST, CONFIRM);
  for (let i = 0; i < 3; i++) d.update(3000);
  let changed = false;
  for (let i = 0; i < 10; i++) changed = changed || d.update(3000);
  check('reading equal to threshold is not rain', !changed);
}

console.log('Automatic control');
{
  const r = new Rig();
  check('boot state: closed, AUTO, no rain',
    r.ctl.cover === COVER_CLOSED && r.ctl.mode === MODE_AUTO && r.ctl.rain === NO_RAIN);
  r.feedN(WET_READING, 2);
  check('cover stays closed before rain is confirmed', r.ctl.cover === COVER_CLOSED);
  const move = r.feed(WET_READING);
  check('rain confirmed -> cover opens', move && r.ctl.cover === COVER_OPEN && r.ctl.rain === RAIN);
  check('change is flagged for Firebase sync', r.ctl.consumeDirty());
  check('dirty flag clears once consumed', !r.ctl.consumeDirty());

  r.feedN(DRY_READING, 3);
  check('rain stopped but cover stays open during dry delay',
    r.ctl.cover === COVER_OPEN && r.ctl.rain === NO_RAIN);
  check('tick just before the dry delay does nothing', !r.ctl.tick(r.now + 119999) && r.ctl.cover === COVER_OPEN);
  check('tick after the dry delay closes the cover', r.ctl.tick(r.now + 120000) && r.ctl.cover === COVER_CLOSED);
  check('tick does not close twice', !r.ctl.tick(r.now + 500000));
}
{
  const r = new Rig();
  r.feedN(WET_READING, 3);
  r.feedN(DRY_READING, 3);
  const firstDryStart = r.now;
  check('still open 60 s into the dry delay', !r.ctl.tick(firstDryStart + 60000));
  r.feedN(WET_READING, 3);
  check('no close while it is raining', !r.ctl.tick(r.now + 1000000) && r.ctl.cover === COVER_OPEN);
  r.feedN(DRY_READING, 3);
  const secondDryStart = r.now;
  check('timer restarted: not closed 100 s after the 2nd dry start',
    !r.ctl.tick(secondDryStart + 100000) && r.ctl.cover === COVER_OPEN);
  check('closes after the 2nd full dry period',
    r.ctl.tick(secondDryStart + 120000) && r.ctl.cover === COVER_CLOSED);
}

console.log('Manual control');
{
  const r = new Rig();
  r.ctl.consumeDirty();
  check('OPEN command opens a closed cover', r.ctl.onCommand(CMD_OPEN) && r.ctl.cover === COVER_OPEN);
  check('OPEN command switches to MANUAL', r.ctl.mode === MODE_MANUAL);
  check('manual change is flagged for sync', r.ctl.consumeDirty());
  check('automatic closing is blocked in MANUAL', !r.ctl.tick(r.now + 10000000) && r.ctl.cover === COVER_OPEN);
  check('CLOSE command closes it', r.ctl.onCommand(CMD_CLOSE) && r.ctl.cover === COVER_CLOSED);
}
{
  const r = new Rig();
  r.ctl.consumeDirty();
  check('CMD_NONE is ignored', !r.ctl.onCommand(CMD_NONE) && r.ctl.mode === MODE_AUTO && !r.ctl.consumeDirty());
  check('CLOSE on an already closed cover does not move it', !r.ctl.onCommand(CMD_CLOSE));
  check('...but still switches to MANUAL and is synced', r.ctl.mode === MODE_MANUAL && r.ctl.consumeDirty());
}
{
  const r = new Rig();
  r.feedN(WET_READING, 3);
  r.ctl.onCommand(CMD_CLOSE);
  check('user can close during rain', r.ctl.cover === COVER_CLOSED && r.ctl.mode === MODE_MANUAL);
  check('cover stays closed while rain status is unchanged', !r.ctl.tick(r.now + 1000000));
  r.feedN(DRY_READING, 3);
  check('rain status change returns control to AUTO', r.ctl.mode === MODE_AUTO);
  check('cover remains closed afterwards', r.ctl.cover === COVER_CLOSED && !r.ctl.tick(r.now + 1000000));
  let move = false;
  for (let i = 0; i < 3; i++) move = move || r.feed(WET_READING);
  check('next rain opens the cover in AUTO', move && r.ctl.cover === COVER_OPEN);
}
{
  const r = new Rig();
  r.ctl.onCommand(CMD_OPEN);
  r.feedN(WET_READING, 3);
  check('rain while manually open: back to AUTO, stays open',
    r.ctl.mode === MODE_AUTO && r.ctl.cover === COVER_OPEN);
  r.feedN(DRY_READING, 3);
  check('then closes after the dry delay', r.ctl.tick(r.now + 120000) && r.ctl.cover === COVER_CLOSED);
}
{
  const r = new Rig();
  r.feedN(WET_READING, 3);
  r.feedN(DRY_READING, 3);
  r.ctl.onCommand(CMD_OPEN);
  check('manual command cancels the pending automatic close',
    !r.ctl.tick(r.now + 1000000) && r.ctl.cover === COVER_OPEN);
}

console.log('Timer rollover');
{
  const c = new CoverController(120000);
  c.onRainChanged(RAIN, 4294960000);
  c.onRainChanged(NO_RAIN, 4294960000);
  check('dry delay works across millis() overflow',
    !c.tick(4294960000 + 100000) && c.tick(4294960000 + 120000));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);