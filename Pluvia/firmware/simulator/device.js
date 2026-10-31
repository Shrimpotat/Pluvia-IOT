// device.js
// A simulated ESP32. It runs the real firmware decision logic against the live
// Firebase project, so every MVP behaviour can be demonstrated and tested before
// any hardware exists.
//
// What it replaces: analogRead(), the servo, and Wi-Fi. What it keeps: the
// RainDetector and CoverController from PluviaLogic, the Firebase write order,
// and the offline-then-resync behaviour.

'use strict';

const {
  NO_RAIN, RAIN, COVER_OPEN, MODE_MANUAL, CMD_NONE, CMD_OPEN, CMD_CLOSE, CMD_AUTO, CMD_MANUAL,
  RainDetector, CoverController,
} = require('./PluviaLogic');
const { Database, DeviceSession, PATHS } = require('./firebase');

// Mirrors the defaults in firmware/Pluvia/config.h. The demo passes a much
// shorter dry delay so the whole cycle can be watched in a minute.
const CONFIG = {
  threshold: 3000,
  hysteresis: 200,
  confirmCount: 3,
  sampleIntervalMs: 2000,
  samplesPerReading: 10,
  dryDelayMs: 120_000,
  syncRetryMs: 5000,
  wifiRetryMs: 10_000,
  heartbeatMs: 15_000,
  // Without a real sensor, "wet" and "dry" are chosen values inside the 0-4095
  // range the FC-37/YL-83 uses. Wet is lower, exactly like the real module.
  wetReading: 1200,
  dryReading: 4000,
  // Random jitter added to each reading, to prove the hysteresis band works.
  jitter: 60,
};

class SimulatedDevice {
  constructor(options = {}) {
    this.config = { ...CONFIG, ...options.config };
    this.db = options.db || new Database(new DeviceSession());
    this.detector = new RainDetector(
      this.config.threshold, this.config.hysteresis, this.config.confirmCount);
    this.controller = new CoverController(this.config.dryDelayMs);

    this.now = 0;
    this.rainLevel = this.config.dryReading;
    this.wet = false;
    this.online = true;            // stands in for Wi-Fi
    this.canReachFlag = true;    // stands in for the Firebase connection
    this.statePending = true;
    this.commandClearPending = false;
    this.bootSyncDone = false;
    this.lastSample = 0;
    this.lastHeartbeat = 0;
    this.retryAt = 0;
    this.lastAverage = 0;        // last averaged reading, published for calibration
    this.pendingCommand = CMD_NONE;
    this.backoffUntil = 0;

    this.coverAngle = 0;         // stands in for the servo angle
    this.log = [];
  }

  // ---------------------------------------------------------------- sensor

  /** Wets or dries the plate. Next readings follow. */
  setRain(wet) {
    this.wet = wet;
    this.rainLevel = wet ? this.config.wetReading : this.config.dryReading;
  }

  /** One averaged reading, with a little noise so it is not unrealistically clean. */
  readRainAverage() {
    let sum = 0;
    for (let i = 0; i < this.config.samplesPerReading; i++) {
      const noise = Math.round((Math.random() - 0.5) * 2 * this.config.jitter);
      sum += Math.max(0, Math.min(4095, this.rainLevel + noise));
    }
    return Math.round(sum / this.config.samplesPerReading);
  }

  // ---------------------------------------------------------------- servo

  /** Mirrors moveCover(): the servo steps towards the target one degree at a time. */
  moveCover(target) {
    const to = target === COVER_OPEN ? 90 : 0;
    const step = to > this.coverAngle ? 1 : -1;
    this.print(`Moving cover -> ${target === COVER_OPEN ? 'OPEN' : 'CLOSED'}`);
    let guard = 0;
    while (this.coverAngle !== to && guard++ < 200) this.coverAngle += step;
  }

  // ---------------------------------------------------------------- network

  setWifi(connected) {
    if (this.online === connected) return;
    this.online = connected;
    this.print(connected
      ? 'Wi-Fi connected, starting Firebase.'
      : 'Wi-Fi lost. Automatic control keeps running.');
  }

  /** True when a Firebase call would succeed right now. */
  get canReach() {
    return this.online && this.canReachFlag !== false && Date.now() >= this.backoffUntil;
  }

  // ---------------------------------------------------------------- loop

  /**
   * One pass of the firmware loop(). Call tick() to also advance the clock, or
   * stepAt() when the caller owns the timing (see demo.js).
   */
  tick(tickMs = this.config.sampleIntervalMs) {
    this.now += tickMs;
    return this.stepAt();
  }

  stepAt() {
    // 1) Rain sensing every SAMPLE_INTERVAL_MS
    if (this.now - this.lastSample >= this.config.sampleIntervalMs) {
      this.lastSample = this.now;
      const average = this.readRainAverage();
      this.lastAverage = average;
      this.print(`Sensor ${average} | rain=${this.rainText()} cover=${this.coverText()} mode=${this.modeText()}`);
      if (this.detector.update(average)) {
        this.print(`Rain status confirmed: ${this.detector.state === RAIN ? 'RAIN' : 'NO_RAIN'}`);
        if (this.controller.onRainChanged(this.detector.state, this.now)) {
          this.moveCover(this.controller.cover);
        }
      }
    }

    // 2) Manual command from the app (priority over automatic control)
    const cmd = this.pendingCommand;
    if (cmd !== CMD_NONE) {
      this.pendingCommand = CMD_NONE;
      this.print(`Control command received: ${cmd}`);
      if (this.controller.onCommand(cmd, this.now)) this.moveCover(this.controller.cover);
      this.commandClearPending = true;
    }

    // 3) Close the cover after the dry delay (automatic mode only)
    if (this.controller.tick(this.now)) this.moveCover(this.controller.cover);

    // 4) Anything changed? Publish it as soon as Firebase is reachable
    if (this.controller.consumeDirty()) this.statePending = true;

    return {
      rainStatus: this.rainText(),
      coverStatus: this.coverText(),
      controlMode: this.modeText(),
      rainLevel: this.lastAverage,
      pending: this.statePending || this.commandClearPending,
      commandClearPending: this.commandClearPending,
    };
  }

  async syncFirebase(state) {
    if (!this.canReach) return false;

    if (!this.bootSyncDone) {
      await this.db.clearCommand();   // ignore commands left over from before
      this.bootSyncDone = true;
    }

    if (!state.pending) return true;

    try {
      await this.db.pushState({
        rainStatus: state.rainStatus,
        coverStatus: state.coverStatus,
        controlMode: state.controlMode,
        rainLevel: state.rainLevel,
      });
      this.statePending = false;
      if (this.commandClearPending) {
        await this.db.clearCommand();
        this.commandClearPending = false;
      }
      this.print(`Synced: rain=${state.rainStatus} cover=${state.coverStatus} mode=${state.controlMode}`);
      return true;
    } catch (err) {
      // Automatic control carries on; the state is pushed again next pass.
      this.print(`Firebase write failed: ${err.message}`);
      this.canReachFlag = false;
      this.backoffUntil = Date.now() + this.config.syncRetryMs;
      return false;
    }
  }

  /** Heartbeat so the app can tell a powered-off device from a quiet one. */
  async heartbeat() {
    if (!this.canReach) return false;
    if (Date.now() - this.lastHeartbeat < this.config.heartbeatMs) return true;
    try {
      await this.db.setServerTime(PATHS.lastSeen);
      this.lastHeartbeat = Date.now();
      this.canReachFlag = true;
      return true;
    } catch (err) {
      this.canReachFlag = false;
      this.backoffUntil = Date.now() + this.config.syncRetryMs;
      return false;
    }
  }

  /** Polls the command field, standing in for the firmware's Firebase stream. */
  async pollCommand() {
    if (!this.canReach) return;
    try {
      const value = await this.db.readCommand();
      if (value === 'OPEN') this.pendingCommand = CMD_OPEN;
      else if (value === 'CLOSE') this.pendingCommand = CMD_CLOSE;
      else if (value === 'AUTO') this.pendingCommand = CMD_AUTO;
      else if (value === 'MANUAL') this.pendingCommand = CMD_MANUAL;
      this.canReachFlag = true;
    } catch (err) {
      this.canReachFlag = false;
      this.backoffUntil = Date.now() + this.config.syncRetryMs;
    }
  }

  // ---------------------------------------------------------------- helpers

  rainText() { return this.controller.rain === RAIN ? 'RAIN' : 'NO_RAIN'; }
  coverText() { return this.controller.cover === COVER_OPEN ? 'OPEN' : 'CLOSED'; }
  modeText() { return this.controller.mode === MODE_MANUAL ? 'MANUAL' : 'AUTO'; }

  print(message) {
    const line = `[${String(Math.floor(this.now / 1000)).padStart(5, ' ')}s] ${message}`;
    this.log.push(line);
    if (this.onLog) this.onLog(line);
  }
}

module.exports = { SimulatedDevice, CONFIG };
