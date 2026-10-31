// demo.js
// Walks the whole MVP through the live Firebase project using the simulated ESP32.
// Each step prints the MVP requirement it demonstrates and then checks the real
// database, so this doubles as an end-to-end test.
//
// Time is measured in simulated ticks, not wall-clock sleeps. The device advances
// one sample interval per step and every step waits for its Firebase writes, so
// the results do not depend on how fast the machine is.
//
// Run: node demo.js

'use strict';

const { SimulatedDevice } = require('./device');
const { Database, DeviceSession } = require('./firebase');

const TICK_MS = 2000;          // firmware SAMPLE_INTERVAL_MS
const DRY_DELAY_MS = 6000;     // short, so the demo finishes quickly

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`); }
}

/** Runs the device loop like the firmware does, until stop() is called. */
class Runner {
  constructor(device, db) {
    this.device = device;
    this.db = db;
    this.stopped = false;
    this.pump = null;
  }

  start() {
    this.pump = (async () => {
      while (!this.stopped) {
        await this.step();
      }
    })();
  }

  /** One pass of the firmware loop(): sample, act, then sync. */
  async step() {
    const device = this.device;
    device.now += TICK_MS;
    const state = device.stepAt();
    if (device.canReach) {
      try {
        if (!device.bootSyncDone) {
          await this.db.clearCommand();
          device.bootSyncDone = true;
        }
        if (state.pending) {
          await this.db.pushState({
            rainStatus: state.rainStatus,
            coverStatus: state.coverStatus,
            controlMode: state.controlMode,
            rainLevel: state.rainLevel,
          });
          device.statePending = false;
          device.lastReading = state.rainLevel;
          if (state.commandClearPending) {
            await this.db.clearCommand();
            device.commandClearPending = false;
          }
        }
        const command = await this.db.readCommand();
        if (command === 'OPEN') device.pendingCommand = 1;
        else if (command === 'CLOSE') device.pendingCommand = 2;
        await this.db.setServerTime('device/lastSeen');
      } catch (err) {
        device.print(`Firebase write failed: ${err.message}`);
        device.canReachFlag = false;
        device.backoffUntil = Date.now() + device.config.syncRetryMs;
      }
    }
  }

  /** Advances n sample intervals, letting each one sync first. */
  async advance(n) {
    for (let i = 0; i < n; i++) await this.step();
  }

  async stop() {
    this.stopped = true;
    if (this.pump) await this.pump;
  }
}

async function main() {
  const db = new Database(new DeviceSession());
  const device = new SimulatedDevice({ db, config: { dryDelayMs: DRY_DELAY_MS } });
  device.onLog = (line) => console.log(`    ${line}`);

  // No background pump here: advance() drives the loop one interval at a time,
  // so every assertion lands on a known tick.
  const runner = new Runner(device, db);

  const state = () => db.get('umbrellaCover');

  console.log('\nPluvia MVP end-to-end demo (simulated ESP32, live Firebase)\n');

  // ---------------------------------------------------------------- 1-3
  console.log('1-3. Rain sensor, averaging, and confirmation of a change');
  await runner.advance(1);
  check('boots with the cover CLOSED and NO_RAIN',
    device.coverText() === 'CLOSED' && device.rainText() === 'NO_RAIN');
  check('those values reached Firebase',
    (await state()).coverStatus === 'CLOSED' && (await state()).rainStatus === 'NO_RAIN');

  device.setRain(true);
  console.log('  water on the plate...');
  await runner.advance(2);
  check('two wet readings alone do NOT trigger anything',
    device.rainText() === 'NO_RAIN' && device.coverText() === 'CLOSED');

  console.log('  third consecutive wet reading...');
  await runner.advance(1);
  check('3 matching readings confirm RAIN',
    device.rainText() === 'RAIN');
  check('the cover opens automatically',
    device.coverText() === 'OPEN');
  const afterRain = await state();
  check('and both are published to Firebase',
    afterRain.rainStatus === 'RAIN' && afterRain.coverStatus === 'OPEN', afterRain);
  check('mode is AUTOMATIC', afterRain.controlMode === 'AUTO');

  // ---------------------------------------------------------------- 5
  console.log('\n5. Cover closes automatically after the dry period');
  device.setRain(false);
  await runner.advance(3);                       // confirm NO_RAIN (3 readings)
  check('rain confirmed NO_RAIN', device.rainText() === 'NO_RAIN');
  check('cover is still OPEN inside the dry delay',
    device.coverText() === 'OPEN', device.coverText());
  check('Firebase still shows it OPEN', (await state()).coverStatus === 'OPEN');

  // DRY_DELAY_MS is 6000, so three more 2 s intervals must pass.
  await runner.advance(3);
  check('cover CLOSED once the dry delay elapsed', device.coverText() === 'CLOSED',
    device.coverText());
  check('and Firebase agrees', (await state()).coverStatus === 'CLOSED', await state());

  // ---------------------------------------------------------------- 7
  console.log('\n7. The four device fields reach Firebase');
  const s = await state();
  check('rainStatus, coverStatus, controlMode present',
    !!s.rainStatus && !!s.coverStatus && !!s.controlMode, s);
  check('updatedAt is a real timestamp', typeof s.updatedAt === 'number' && s.updatedAt > 0, s.updatedAt);
  check('rainLevel (averaged reading) is published for calibration',
    typeof s.rainLevel === 'number' && s.rainLevel >= 0 && s.rainLevel <= 4095, s.rainLevel);

  // ---------------------------------------------------------------- 9-10
  console.log('\n9-10. "Open cover" in the app reaches the device');
  await db.set('umbrellaCover/command', 'OPEN');   // stands in for the app
  console.log('  app wrote command=OPEN...');
  await runner.advance(2);
  check('cover OPEN', device.coverText() === 'OPEN');
  check('mode MANUAL (manual has priority)', device.modeText() === 'MANUAL');
  const manual = await state();
  check('both published', manual.coverStatus === 'OPEN' && manual.controlMode === 'MANUAL', manual);
  check('device clears the command back to NONE', (await state()).command === 'NONE');

  // ---------------------------------------------------------------- 11
  console.log('\n11. Rain status change hands control back to AUTOMATIC');
  device.setRain(true);
  await runner.advance(3);
  check('mode is AUTOMATIC again', device.modeText() === 'AUTO', device.modeText());
  check('cover OPEN (it was already open)', device.coverText() === 'OPEN');

  console.log('\n10b. "Close cover" overrides automatic control even while raining');
  await db.set('umbrellaCover/command', 'CLOSE');
  await runner.advance(2);
  check('cover CLOSED against the rain', device.coverText() === 'CLOSED');
  check('mode MANUAL', device.modeText() === 'MANUAL');
  check('published', (await state()).coverStatus === 'CLOSED' && (await state()).controlMode === 'MANUAL');

  device.setRain(false);
  await runner.advance(3);
  console.log('  rain stopped, waiting out the dry delay...');
  await runner.advance(3);
  check('back to AUTOMATIC with the cover CLOSED',
    device.modeText() === 'AUTO' && device.coverText() === 'CLOSED',
    `${device.modeText()}/${device.coverText()}`);

  // ---------------------------------------------------------------- 12
  console.log('\n12. Automatic control continues without Wi-Fi, then re-syncs');
  device.setWifi(false);
  device.setRain(true);
  console.log('  Wi-Fi down, rain starts...');
  await runner.advance(3);
  check('cover opens locally with no connection', device.coverText() === 'OPEN');
  check('the device has a pending state to sync', device.statePending === true);
  const stale = await state();
  check('Firebase still shows the old value (device could not write)',
    stale.coverStatus === 'CLOSED', stale.coverStatus);

  console.log('  Wi-Fi restored...');
  device.setWifi(true);
  await runner.advance(1);
  const resynced = await state();
  check('device re-syncs the real state',
    resynced.rainStatus === 'RAIN' && resynced.coverStatus === 'OPEN', resynced);

  // ---------------------------------------------------------------- heartbeat
  console.log('\nExtra. Heartbeat lets the app tell a dead device from a quiet one');
  const lastSeen = await db.get('device/lastSeen');
  check('device/lastSeen was written', typeof lastSeen === 'number' && lastSeen > 0, lastSeen);
  check('and it is recent', Math.abs(Date.now() - lastSeen) < 120_000,
    Math.round((Date.now() - lastSeen) / 1000) + 's ago');

  await runner.stop();

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`\nFinal database state:\n${JSON.stringify(await state(), null, 2)}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nDemo failed:', err.message);
  process.exit(1);
});