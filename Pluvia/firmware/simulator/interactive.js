// interactive.js
// Type-driven rain simulator for demoing to someone. Press a key and the
// simulated rain sensor, cover and Firebase state follow, in real time.
//
//   npm run interactive
//
// Keys
//   r  start rain
//   d  dry the plate
//   o  send an OPEN command  (stands in for the app's Open button)
//   c  send a CLOSE command (stands in for the app's Close button)
//   w  toggle Wi-Fi       (proves automatic control works offline)
//   s  show the current state
//   q  quit

'use strict';

const readline = require('readline');
const { SimulatedDevice } = require('./device');
const { Database, DeviceSession } = require('./firebase');

const TICK_MS = 500;

async function main() {
  const db = new Database(new DeviceSession());
  // 20 second dry delay: long enough to look real, short enough to sit through.
  const device = new SimulatedDevice({ db, config: { dryDelayMs: 20_000 } });
  device.onLog = (line) => console.log(line);

  await db.announceDevice('simulator (node)').catch(() => {});

  console.log('\nPluvia rain simulator.  Press r to rain, d to dry, q to quit.');
  console.log('r=rain  d=dry  o=open cmd  c=close cmd  w=toggle wifi  s=status  q=quit\n');

  let running = true;
  const loop = (async () => {
    while (running) {
      const state = device.tick(TICK_MS);
      await device.syncFirebase(state);
      await device.pollCommand();
      await device.heartbeat();
      await new Promise((r) => setTimeout(r, TICK_MS));
    }
  })();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', async (line) => {
    const key = line.trim().toLowerCase();
    switch (key) {
      case 'r':
        device.setRain(true);
        console.log('>> water on the plate');
        break;
      case 'd':
        device.setRain(false);
        console.log('>> plate dried');
        break;
      case 'o':
        await db.set('umbrellaCover/command', 'OPEN').catch((e) => console.log(`  ${e.message}`));
        console.log('>> command written: OPEN');
        break;
      case 'c':
        await db.set('umbrellaCover/command', 'CLOSE').catch((e) => console.log(`  ${e.message}`));
        console.log('>> command written: CLOSE');
        break;
      case 'w':
        device.setWifi(!device.online);
        break;
      case 's':
        try {
          console.log('>> database:', JSON.stringify(await db.get('umbrellaCover')));
        } catch (e) { console.log(`  ${e.message}`); }
        break;
      case 'q':
      case 'quit':
      case 'exit':
        running = false;
        rl.close();
        break;
      default:
        if (key) console.log('>> unknown key');
    }
  });

  rl.on('close', async () => {
    running = false;
    await loop;
    console.log('\nStopped. The cover state stays in the database as it was.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Simulator failed:', err.message);
  process.exit(1);
});