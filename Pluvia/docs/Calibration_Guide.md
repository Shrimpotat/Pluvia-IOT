# Calibration Guide (rain threshold)

Every FC-37/YL-83 module reads a little differently, so the starting value `RAIN_THRESHOLD = 3000` must be checked once.

## Steps

1. In `config.h` set `#define CALIBRATION_MODE 1`, upload, and open **Serial Monitor (115200 baud)**.
   The ESP32 prints the raw reading (0 to 4095) twice a second. Servo and Wi-Fi are off in this mode.
2. Mount the sensor the way it will be used (tilted, outdoors side of the box) and record the values:

| Condition | Typical reading | Your reading |
| --- | --- | --- |
| Completely dry plate | 3800 to 4095 | |
| A few drops | 2500 to 3500 | |
| Light spray, plate partly wet | 1500 to 3000 | |
| Heavy pour, plate covered | 300 to 1500 | |

3. Pick `RAIN_THRESHOLD` **between the dry value and the "few drops" value**, so a few drops count as rain but dust and humidity do not. Example: dry = 4050, few drops = 2600, so use about 3400.
4. Keep `RAIN_HYSTERESIS` around 200. Rain only ends when the reading rises above `RAIN_THRESHOLD + RAIN_HYSTERESIS`, so make sure your dry value is higher than that sum.
5. Set `CALIBRATION_MODE` back to `0` and upload the normal firmware.

## Notes

- Wet plate means **lower** number on most modules. If yours is the opposite, tell your adviser before changing the logic.
- The plate corrodes with use. Dry it after testing and re-check the dry value occasionally.
- Record your final numbers in your documentation as the calibrated values for the FRS "Operating Parameters" table.
