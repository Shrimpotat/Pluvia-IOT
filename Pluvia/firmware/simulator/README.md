# Pluvia simulator

A simulated ESP32. It runs the real firmware decision logic against the live
Firebase project, so the whole MVP can be demonstrated and tested before any
hardware exists.

## Why

The MVP needs a rain sensor, an ESP32 and a servo. None of those are available
yet, but everything else can be finished now: the decision logic, the Firebase
layout, the security rules and the Android app. This simulator stands in for the
missing hardware only. It reuses `PluviaLogic.h`'s behaviour verbatim, so a demo
that passes here is a demo of the real control flow.

It is not a substitute for the hardware test. It cannot prove that GPIO34 reads
the sensor, that the servo angles fit the lid, or that the rain threshold is
right. It proves the logic, the data flow and the app.

## Requirements

Node.js 18 or newer. Nothing else: no `npm install`, no SDK.

## Run it

```
cd firmware/simulator
npm run demo          # scripted walk through every MVP requirement, with checks
npm test              # 41 logic tests, matching firmware/tests/test_logic.cpp
npm run interactive   # type-driven, for demoing to someone
```

`npm run demo` runs 31 checks against the live database covering all twelve MVP
requirements, and prints PASS/FAIL for each.
It advances the simulated clock one sample interval at a time and waits for each
Firebase write, so it finishes in a few seconds and gives the same result on a
fast or slow machine. `npm run interactive` is the one to use when you want to
show the Android app reacting.

### Interactive keys

| Key | Effect |
| --- | --- |
| `r` | start rain |
| `d` | dry the plate |
| `o` | write an OPEN command (stands in for the app's Open button) |
| `c` | write a CLOSE command |
| `w` | toggle Wi-Fi, to show automatic control carrying on offline |
| `s` | print the current database state |
| `q` | quit |

## Files

| File | Purpose |
| --- | --- |
| `PluviaLogic.js` | JavaScript port of `firmware/Pluvia/PluviaLogic.h` |
| `parity.test.js` | 41 assertions copied from `firmware/tests/test_logic.cpp`, so the port cannot drift |
| `device.js` | the simulated ESP32: sensor, servo, Wi-Fi, sync loop |
| `firebase.js` | REST client, signed in as the device account |
| `demo.js` | end-to-end walk through the MVP |
| `interactive.js` | manual control for demos |

## What it mirrors, and what it fakes

Mirrors exactly:

- `RainDetector` and `CoverController`, including hysteresis, the consecutive
  reading confirmation, the dry delay, and manual priority
- the Firebase write order, so each field passes the same rule check
- ignoring commands left over from before power-up
- keeping automatic control running while the network is down, then re-syncing

Fakes:

- `analogRead()`: returns a chosen dry or wet value plus small noise
- the servo: a target angle instead of PWM
- Wi-Fi: a flag you can toggle

The dry delay is shortened (6 s in the demo, 20 s interactively) so a full cycle
fits in a minute. `firmware/Pluvia/config.h` keeps the real 2 minutes.

## Changing the thresholds

`CONFIG` in `device.js` mirrors the defaults in `firmware/Pluvia/config.h`. If
you change one, change both. Threshold, hysteresis and confirm count are already
covered by `parity.test.js`, so a mistake shows up as a failing test.

## After the hardware arrives

Keep this around. It is useful as a test bench: if a change to `PluviaLogic.h`
breaks the parity test, the change is wrong, and you find out on a PC in a second
instead of on a desk with an umbrella on it.