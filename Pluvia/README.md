# Pluvia

An ESP32-based automatic umbrella holder with rain-responsive cover actuation and Android monitoring.
This package implements the Pluvia FRS: firmware, Android app, Firebase setup, and documents.

```
Rain sensor -> ESP32 -> servo (cover)
                 |
              Wi-Fi
                 |
        Firebase Realtime Database  <->  Android app (status, Open, Close)
```

## What is inside

| Folder | Contents |
| --- | --- |
| `android/` | Android Studio project (Kotlin): login, signup, Pluvia dashboard |
| `firmware/Pluvia/` | ESP32 sketch (`Pluvia.ino`), settings (`config.h`), decision logic (`PluviaLogic.h`) |
| `firmware/simulator/` | Node simulator that runs the firmware logic against the live Firebase project (no hardware needed) |
| `firmware/tests/` | PC tests for the decision logic (41 tests) |
| `firebase/` | Security rules and starter data |
| `docs/` | Setup guide, calibration guide, test cases, corrected diagrams |

## Quick start

1. **Firebase**: already set up (project `pluvia-app`). Open `docs/Setup_Guide.md`, part 1 for the values.
2. **Android**: open the `android` folder in Android Studio, paste your four Firebase values into `PluviaConfig.kt`, and run.
3. **Hardware**: wire it as shown in `docs/Setup_Guide.md`, part 3.
4. **Calibrate** the rain sensor (`docs/Calibration_Guide.md`).
5. **Firmware**: edit `config.h`, upload `Pluvia.ino`, and watch the Serial Monitor.
6. Run the demo script in the setup guide, then fill in `docs/Test_Cases.md`.

## FRS coverage

| FRS 1.1 requirement | Where it is implemented |
| --- | --- |
| 1 Detect rain with a rain sensor on the ESP32 | `Pluvia.ino` (`readRainAverage`) |
| 2 Regular readings, averaged | `Pluvia.ino`: every 2 s, 10 samples averaged |
| 3 Confirm status after consecutive readings | `PluviaLogic.h` (`RainDetector`) |
| 4 Open the cover when rain is confirmed | `PluviaLogic.h` + `moveCover()` |
| 5 Close after a dry period | `PluviaLogic.h` (`CoverController::tick`) |
| 6 Wi-Fi | `Pluvia.ino` (`maintainWifi`) |
| 7 Send rain, cover, mode and time to Firebase | `Pluvia.ino` (`pushState`) |
| 8 App shows cover and rain status in real time | `MainActivity.kt` |
| 9 App has Open and Close buttons | `MainActivity.kt` (`sendCommand`) |
| 10 ESP32 reads commands; manual has priority | `Pluvia.ino` (stream) + `CoverController::onCommand` |
| 11 Return to automatic when rain status changes | `CoverController::onRainChanged` |
| 12 Works without Wi-Fi, re-syncs later | `Pluvia.ino` (local loop, `statePending`) |

Every one of these is verified against the live Firebase project by
`firmware/simulator` (`npm run demo`, 31 checks), using the same decision logic
the ESP32 runs. See `firmware/simulator/README.md` for what the simulator cannot prove.

FRS 1.3 database fields (`rainStatus`, `coverStatus`, `controlMode`, `command`, `updatedAt`) and the security measures (Firebase Authentication, security rules, HTTPS) are implemented as written.

Two fields were added on top of the FRS, because the MVP needs them and the FRS
schema did not have room for them:

| Field | Why |
| --- | --- |
| `umbrellaCover/rainLevel` | the averaged sensor reading (0-4095). Lets you calibrate the rain threshold from the phone instead of only from the Serial Monitor. |
| `device/lastSeen` | a 15-second heartbeat. Without it the app cannot tell "the phone is offline" from "the device is powered off". |

## Verification status (please read)

| Part | What was checked | What was NOT checked |
| --- | --- | --- |
| Decision logic | 41 automated tests on a PC, all passing, including millis() overflow. The same 41 run against the JavaScript port the simulator uses. | |
| ESP32 sketch | Compiled and run on a PC against stand-in versions of the Arduino and Firebase libraries to catch mistakes in our own code | Not compiled with the real ESP32 toolchain and Firebase library, not run on a board |
| Android app | Debug APK built successfully with Gradle 8.4, Android SDK 34 and JDK 21. All MVP fields verified against the live database through the simulator | Not run on a phone or emulator |
| MVP end to end | 31 checks against the live database, all passing, covering all twelve MVP requirements including offline control and re-sync | Not run against the real ESP32, rain sensor or servo |
| Firebase rules | Published to the live database; signup, login, status read, and both write rules (device write allowed, normal-user write of `rainStatus` denied) all verified | |

Expect to spend a little time on first-run issues (library versions, pin numbers, calibration). That is normal for a hardware project.

## Design decisions and limitations

- **Accounts**: the original local (SharedPreferences) login was replaced by Firebase Authentication, so the FRS security measures apply. Name and phone are kept in `/users/<uid>`, a small addition to the FRS database.
- **Open signup**: anyone with the app can create an account. Fine for a school prototype; restrict signups before real use.
- **Device account**: the ESP32 signs in as `device@pluvia.app`. Only that account may write rain, cover, mode and time. Create it before any user signs up.
- **Cover status** is the commanded servo position (no position sensor), as stated in the FRS.
- **Device offline indicator**: the app shows "Device offline" when `device/lastSeen` is
  more than 45 seconds old. The FRS had no heartbeat field, so this one was added.
- **Stale commands**: commands left over from before power-up are ignored. If the user taps twice very quickly, one command may be lost.
- **Start position**: the cover must be closed when the ESP32 powers on.
- **No hardware yet**: the ESP32, rain sensor and servo are not built. Everything else is
  finished and tested. `firmware/simulator` stands in for the missing hardware and is how the
  MVP was verified.
- **Package name** stays `com.rainq.app` (inherited from the login project); the app name shown is Pluvia.
- **Diagrams**: the three figures inside the submitted FRS PDF still show the old name "RainCover" in their titles. Corrected versions are in `docs/diagrams/`.
