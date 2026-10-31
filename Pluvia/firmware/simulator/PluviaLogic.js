// PluviaLogic.js
// A faithful JavaScript port of firmware/Pluvia/PluviaLogic.h.
//
// It exists so the simulated ESP32 makes exactly the same decisions as the real
// firmware. parity.test.js checks this port against the 41 assertions in
// firmware/tests/test_logic.cpp, so the two cannot drift apart silently.
//
// Keep this file in step with PluviaLogic.h. Any change there must be mirrored
// here, and parity.test.js must still pass.

'use strict';

const NO_RAIN = 0;
const RAIN = 1;
const COVER_CLOSED = 0;
const COVER_OPEN = 1;
const MODE_AUTO = 0;
const MODE_MANUAL = 1;
const CMD_NONE = 0;
const CMD_OPEN = 1;
const CMD_CLOSE = 2;
const CMD_AUTO = 3;
const CMD_MANUAL = 4;

/** Turns averaged sensor readings into RAIN / NO_RAIN. Mirrors RainDetector. */
class RainDetector {
  constructor(threshold, hysteresis, confirmCount) {
    this.threshold = threshold;
    this.hysteresis = hysteresis;
    this.confirmCount = confirmCount;
    this.state = NO_RAIN;
    this.streak = 0;
  }

  /** Feed one averaged reading. Returns true when the confirmed status changed. */
  update(average) {
    let candidate;
    if (this.state === NO_RAIN) {
      candidate = average < this.threshold ? RAIN : NO_RAIN;
    } else {
      candidate = average > this.threshold + this.hysteresis ? NO_RAIN : RAIN;
    }

    if (candidate === this.state) {
      this.streak = 0;
      return false;
    }
    this.streak += 1;
    if (this.streak >= this.confirmCount) {
      this.state = candidate;
      this.streak = 0;
      return true;
    }
    return false;
  }
}

/** Decides when the cover should be open or closed. Mirrors CoverController. */
class CoverController {
  constructor(dryDelayMs) {
    this.dryDelayMs = dryDelayMs;
    this.cover = COVER_CLOSED;
    this.mode = MODE_AUTO;
    this.rain = NO_RAIN;
    this.dryTimerRunning = false;
    this.dryStartMs = 0;
    this.dirty = false;
  }

  /** Rain status was confirmed to have changed. */
  onRainChanged(rain, nowMs) {
    this.rain = rain;
    this.dirty = true;

    // MVP #12: a rain status change hands control back to automatic mode.
    if (this.mode === MODE_MANUAL) this.mode = MODE_AUTO;

    if (rain === RAIN) {
      this.dryTimerRunning = false;
      if (this.cover === COVER_CLOSED) {
        this.cover = COVER_OPEN;
        return true;
      }
      return false;
    }

    this.dryTimerRunning = true;
    this.dryStartMs = nowMs;
    return false;
  }

  /** Switches mode from the app and applies current automatic conditions. */
  setMode(mode, nowMs) {
    if (this.mode === mode) return false;
    this.mode = mode;
    this.dirty = true;
    if (mode === MODE_MANUAL) {
      this.dryTimerRunning = false;
      return false;
    }
    if (this.rain === RAIN) {
      this.dryTimerRunning = false;
      if (this.cover === COVER_CLOSED) {
        this.cover = COVER_OPEN;
        return true;
      }
      return false;
    }
    this.dryTimerRunning = this.cover === COVER_OPEN;
    this.dryStartMs = nowMs;
    return false;
  }

  /** Open/Close commands select Manual; mode commands select either mode. */
  onCommand(cmd, nowMs = 0) {
    if (cmd === CMD_NONE) return false;
    if (cmd === CMD_AUTO) return this.setMode(MODE_AUTO, nowMs);
    if (cmd === CMD_MANUAL) return this.setMode(MODE_MANUAL, nowMs);
    if (this.mode !== MODE_MANUAL) {
      this.setMode(MODE_MANUAL, nowMs);
    }
    const target = cmd === CMD_OPEN ? COVER_OPEN : COVER_CLOSED;
    if (target === this.cover) return false;
    this.cover = target;
    this.dirty = true;
    return true;
  }

  /** Call often. Closes the cover once it has stayed dry long enough. */
  tick(nowMs) {
    if (this.mode !== MODE_AUTO) return false;
    if (this.cover !== COVER_OPEN || this.rain !== NO_RAIN) return false;
    if (!this.dryTimerRunning) return false;
    if ((nowMs - this.dryStartMs) < this.dryDelayMs) return false;

    this.dryTimerRunning = false;
    this.cover = COVER_CLOSED;
    this.dirty = true;
    return true;
  }

  /** True once after any change that must be published to Firebase. */
  consumeDirty() {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }
}

module.exports = {
  NO_RAIN, RAIN,
  COVER_CLOSED, COVER_OPEN,
  MODE_AUTO, MODE_MANUAL,
  CMD_NONE, CMD_OPEN, CMD_CLOSE, CMD_AUTO, CMD_MANUAL,
  RainDetector, CoverController,
};
