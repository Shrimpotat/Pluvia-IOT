// config.h - the ONLY file you need to edit before uploading Pluvia.ino
#pragma once

// ============================ Wi-Fi (2.4 GHz only) ============================
#define WIFI_SSID      "YOUR_WIFI_NAME"
#define WIFI_PASSWORD  "YOUR_WIFI_PASSWORD"

// ================================ Firebase ===================================
// Firebase console > Project settings > General > "Web API Key"
#define API_KEY        "AIzaSyA3oKDDtnYp1Jqo8tQX92S6BgnyTwbdyDc"
// Firebase console > Realtime Database > the URL shown at the top of the Data tab
#define DATABASE_URL   "https://pluvia-app-default-rtdb.asia-southeast1.firebasedatabase.app/"
// The device's own account (create it in Firebase console > Authentication > Users).
// The email MUST match the one written in firebase/database.rules.json.
#define DEVICE_EMAIL     "device@pluvia.app"
#define DEVICE_PASSWORD  "PluviaDevice2026"

// ================================== Pins =====================================
#define RAIN_SENSOR_PIN  34   // AO of the rain module. Must be an ADC1 pin (32-39).
#define SERVO_PIN        18   // servo signal wire (orange/yellow)
#define LED_PIN          2    // optional status LED (on-board LED on most ESP32 boards)

// ============================ Rain detection =================================
#define SAMPLE_INTERVAL_MS   2000   // a new reading every 2 seconds
#define SAMPLES_PER_READING  10     // each reading is the average of 10 quick samples
#define RAIN_THRESHOLD       3000   // reading BELOW this means wet (0-4095). Calibrate it!
#define RAIN_HYSTERESIS      200    // must rise above THRESHOLD + this to count as dry
#define CONFIRM_COUNT        3      // consecutive readings needed to change the status

// ============================== Cover control ================================
#define DRY_DELAY_MS         120000UL  // dry time before closing (use 10000UL for a quick demo)
#define SERVO_CLOSED_ANGLE   0         // adjust to fit your prototype
#define SERVO_OPEN_ANGLE     90        // adjust to fit your prototype
#define SERVO_STEP_DELAY_MS  15        // bigger = slower, gentler movement

// ============================== Calibration ==================================
// Set to 1 to only print raw sensor readings (no servo, no Wi-Fi). See docs/Calibration_Guide.
#define CALIBRATION_MODE     0
