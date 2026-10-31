# Pluvia Setup Guide

Follow the parts in order: **1 Firebase, 2 Android app, 3 Hardware, 4 Firmware, 5 Demo.**
Total time: about 1 to 2 hours the first time.

---

## 1. Firebase

**Already set up for this copy.** Console: <https://console.firebase.google.com/project/pluvia-app/overview>

| Item | Value |
| --- | --- |
| Project ID | `pluvia-app` (display name **Pluvia**) |
| Database | `pluvia-app-default-rtdb`, location `asia-southeast1` |
| Web API Key | `AIzaSyA3oKDDtnYp1Jqo8tQX92S6BgnyTwbdyDc` |
| Android App ID | `1:88394056900:android:229918a72c04d7723c7591` |
| Device account | `device@pluvia.app` / `PluviaDevice2026` |

Done: Realtime Database created, security rules published, starter data imported, Android app
registered, Email/Password sign-in enabled, device account created, `PluviaConfig.kt` and
`firmware/Pluvia/config.h` filled in. Signup, login, reading the status and both write rules were
verified against the live database.

The steps below are kept for anyone who needs to rebuild the project from scratch.

### From scratch

You need a free Google account. The free (Spark) plan is enough.

1. Go to <https://console.firebase.google.com> and click **Create a project**. Name it `Pluvia`. You can turn Google Analytics off.
2. **Realtime Database**
   - Left menu: **Build > Realtime Database > Create Database**.
   - Location: **Singapore (asia-southeast1)** is closest to Cebu.
   - Choose **Start in locked mode**, then **Enable**.
   - Copy the database URL shown at the top of the **Data** tab. It looks like
     `https://pluvia-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app/`
3. **Rules**
   - Open the **Rules** tab, delete everything, paste the contents of `firebase/database.rules.json`, and click **Publish**.
   - If you use another device email than `device@pluvia.app`, change it in the rules too (4 places).
4. **Starter data**
   - Open the **Data** tab, click the three dots (⋮) at the top right, choose **Import JSON**, and select `firebase/initial_data.json`.
   - Do this only once, while the database is still empty. Importing at the root replaces everything.
5. **Authentication**
   - **Build > Authentication > Get started > Sign-in method > Email/Password > Enable > Save**.
   - Open the **Users** tab and click **Add user** for the **device account**:
     email `device@pluvia.app`, and a password of your choice. The ESP32 uses this account.
     Create it **before** anyone signs up in the app.
6. **Register the Android app** (only needed to get the App ID)
   - Click the gear icon, then **Project settings > General > Your apps > Add app > Android**.
   - Package name: `com.rainq.app`. Click **Register app**, then you can skip the remaining steps.
7. **Write these four values down** (all on **Project settings > General**):

| Value | Where to find it |
| --- | --- |
| Web API Key | General tab, near the top |
| Project ID | General tab, near the top |
| App ID | General tab > Your apps > the Android app (looks like `1:123456789:android:abc123`) |
| Database URL | Realtime Database > Data tab (step 2) |

> If you cannot find the Web API Key, register the app, download `google-services.json`, and look for `current_key` (API key), `mobilesdk_app_id` (App ID), `project_id`, and `firebase_url`.

---

## 2. Android app

1. In Android Studio choose **File > Open** and select the **`android`** folder (the folder that directly contains `settings.gradle.kts` and `gradlew.bat`; do not open the outer `Pluvia` folder).
2. If prompted, trust the project and use Android Studio's bundled JDK (JDK 17 or 21) as the **Gradle JDK**. Install **Android SDK Platform 34** in SDK Manager if it is missing.
3. `app/src/main/java/com/rainq/app/PluviaConfig.kt` is already filled in with this project's values. Only change them if you point the app at a different Firebase project.
4. Let Gradle sync finish (first time takes a few minutes and needs internet).
5. Pick your emulator or phone and press **Run** on the `app` configuration.
6. In the app tap **Sign up**, create an account, and you land on the dashboard.

Notes
- The emulator should be a **Google APIs / Google Play** image with correct date and time.
- Android Studio older than Koala is supported: the project uses Android Gradle Plugin 8.3.2 and Gradle 8.4.
- If you see "Firebase is not set up yet", the `PASTE_...` values are still in `PluviaConfig.kt`.
- The package name stays `com.rainq.app` (inherited from the login project). The app name shown on the phone is **Pluvia**.
- Without hardware the dashboard will sit on "Waiting for the first status". Run the
  simulator (part 2b) and the app starts reacting for real.

---

## 2b. Run it without the hardware

The ESP32, rain sensor and servo are not built yet, but everything else is done.
A simulator in `firmware/simulator/` stands in for the missing hardware: it runs
the real firmware decision logic against the real Firebase project, so the whole
MVP can be tested and demoed now.

Needs Node.js 18 or newer. No `npm install`.

```
cd firmware/simulator
npm run demo          # checks every MVP requirement against the live database
npm run interactive   # press r to rain, d to dry, w to break the Wi-Fi
```

Run `npm run interactive` in one terminal and the Android app in the emulator.
Tap **Open cover** or **Close cover** in the app and the simulator acts on it.
Full details, including what the simulator fakes and what it does not, are in
`firmware/simulator/README.md`.

What it cannot prove: that GPIO34 reads the sensor correctly, that the servo
angles fit the lid, or that the rain threshold is calibrated. Those need part 3.

---

## 3. Hardware

### Parts (from the FRS)
ESP32 dev board, FC-37/YL-83 rain sensor with control module, SG90 or MG90S servo, small box with a lightweight hinged lid, breadboard, jumper wires, USB cable and 5 V power, optional LED.

### Wiring

| Component pin | ESP32 pin | Note |
| --- | --- | --- |
| Rain sensor VCC | 3V3 | 3.3 V keeps the analog output within the ESP32 range |
| Rain sensor GND | GND | |
| Rain sensor AO | GPIO34 | ADC1 pin. Leave DO unconnected |
| Servo V+ (red) | 5V / VIN | From the USB 5 V line |
| Servo GND (brown/black) | GND | Common ground |
| Servo signal (orange/yellow) | GPIO18 | |
| LED (optional) | GPIO2 (on-board LED) | Lights while the cover is open |

If the ESP32 restarts whenever the servo moves, power the servo from a separate 5 V supply, join its GND to the ESP32 GND, and add a 470 µF capacitor across the servo supply.

### Building the prototype
- Mount the **sensor plate on the box body (not on the lid)**, outside, tilted slightly so water runs off and the plate can dry.
- Attach the servo horn to the lid with a small linkage so 0° = closed and 90° = open. Adjust `SERVO_CLOSED_ANGLE` and `SERVO_OPEN_ANGLE` in `config.h` to fit.
- Keep the ESP32 and breadboard dry. Only the sensor plate should be exposed to water.
- **Always power on with the lid closed.** The firmware assumes the cover starts closed.

---

## 4. Firmware

1. Install **Arduino IDE 2.x**.
2. **File > Preferences > Additional boards manager URLs**, add
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   then **Tools > Board > Boards Manager**, install **esp32 by Espressif Systems**.
3. **Tools > Manage Libraries**, install:
   - **Firebase Arduino Client Library for ESP8266 and ESP32** (by Mobizt)
   - **ESP32Servo** (by Kevin Harrington, John K. Bennett)
4. Open `firmware/Pluvia/Pluvia.ino`. The folder name must stay `Pluvia`.
5. Edit **`config.h`**: only the Wi-Fi name and password (2.4 GHz network) are still yours to fill in.
   The Firebase `API_KEY`, `DATABASE_URL` and `DEVICE_PASSWORD` are already set.
6. **Calibrate the sensor first** (see `Calibration_Guide.md`) and set `RAIN_THRESHOLD`.
7. Select **Tools > Board > ESP32 Dev Module** and the right port, then **Upload**. Hold the **BOOT** button during "Connecting..." if the upload stalls.
8. Open **Serial Monitor at 115200 baud**. You should see sensor readings every 2 seconds, then `Synced: rain=NO_RAIN cover=CLOSED mode=AUTO`.

> If the compiler complains about the Firebase or ESP32 library versions, update both to the newest versions, or install board package **esp32 2.0.17** and try again.

---

## 5. Demo script

For a quick demo set `DRY_DELAY_MS` to `10000UL` in `config.h` (10 seconds instead of 2 minutes).

| Step | Do this | Expected result |
| --- | --- | --- |
| 1 | Open the app | Cover CLOSED, No Rain, Automatic, status "Live" |
| 2 | Drip water on the sensor plate | After about 6 s: Rain Detected, cover opens, app updates |
| 3 | Dry the plate with a tissue | After about 6 s: No Rain; after the dry delay the cover closes |
| 4 | Tap **Open cover** | Cover opens, mode shows Manual |
| 5 | Tap **Close cover** | Cover closes, mode stays Manual |
| 6 | Drip water again, then dry it | Mode returns to Automatic when the rain status changes |
| 7 | Turn off the router, then drip water | The cover still opens (automatic control works offline) |
| 8 | Turn the router back on | The app catches up with the real state |

---

## Troubleshooting

| Problem | Likely cause and fix |
| --- | --- |
| Android: "Firebase is not set up yet" | The four values in `PluviaConfig.kt` still start with `PASTE_` |
| Android: signup says network error | Emulator has no internet, or wrong API key |
| Android: signup/login fails with `CONFIGURATION_NOT_FOUND` or `OPERATION_NOT_ALLOWED` | Email/Password is not enabled yet in Authentication (see part 1, step 1) |
| Android: dashboard says "Waiting for the first status" | Starter data not imported, or the ESP32 is not connected |
| Android: "Device offline" | `device/lastSeen` is more than 45 s old: the device is powered off or has no Wi-Fi. Run `npm run interactive` in `firmware/simulator` if you have no hardware yet |
| Android: "Permission denied" message | Rules not published, or you are not logged in |
| Buttons say "You are offline" | The phone has no connection to Firebase; check internet |
| Serial: `Firebase not reachable yet` | Wrong `DATABASE_URL`, wrong API key, or Wi-Fi is not 2.4 GHz |
| Serial: token / `INVALID_PASSWORD` / `EMAIL_NOT_FOUND` | Device account missing or the password in `config.h` is wrong |
| Serial: `PERMISSION_DENIED` | Rules not published, or the device email in the rules differs from `config.h` |
| Reading always about 4095 or 0 | Check the AO wire, 3V3 power, and that the pin is GPIO34 |
| Rain never detected | Threshold too low. Re-calibrate (Calibration_Guide.md) |
| Cover opens with no rain | Threshold too high, or a wet or dirty plate |
| ESP32 resets when the servo moves | Separate 5 V supply for the servo and a 470 µF capacitor |
| Servo buzzes or shakes at the end | Adjust `SERVO_OPEN_ANGLE` / `SERVO_CLOSED_ANGLE` so the lid does not push against its stop |
