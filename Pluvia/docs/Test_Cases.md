# Pluvia Test Cases

Fill in the **Result** column (Pass / Fail) and add notes for any failure.
"FRS" refers to the requirement numbers in section 1.1 of the FRS. Set `DRY_DELAY_MS` to `10000UL` while testing.

Tester: ______________________  Date: ______________  Firmware build: ______________

Fill in the **Result** column for sections A to E once the hardware exists. Section F
has already been run and passes.

## A. Account and login (Android)

| ID | FRS | Test | Steps | Expected result | Result |
| --- | --- | --- | --- | --- | --- |
| A1 | - | Sign up with valid data | Fill all fields correctly, tap Sign up | Account created, dashboard opens, name shown in header | |
| A2 | - | Empty form | Tap Sign up with all fields empty | Error under every field, no account created | |
| A3 | - | Invalid email | Enter `abc@` | "Enter a valid email address" | |
| A4 | - | Invalid mobile number | Enter `12345` | "Use 09XXXXXXXXX or +639XXXXXXXXX" | |
| A5 | - | Weak password | Enter `abc` | Password rule message shown | |
| A6 | - | Password mismatch | Different confirm password | "Passwords do not match" | |
| A7 | - | Duplicate email | Sign up again with the same email | "This email is already registered" | |
| A8 | - | Log in, correct credentials | Enter registered email and password | Dashboard opens | |
| A9 | - | Log in, wrong password | Wrong password | "Incorrect email or password" | |
| A10 | - | Log in, unknown email | Unregistered email | "Incorrect email or password" | |
| A11 | - | Session is remembered | Log in, close the app completely, reopen | Dashboard opens without login | |
| A12 | - | Log out | Tap Log out, confirm | Login screen; Back button does not return to dashboard | |
| A13 | - | No internet at login | Turn off data/Wi-Fi, try to log in | Network error message, no crash | |

## B. Dashboard (Android)

| ID | FRS | Test | Steps | Expected result | Result |
| --- | --- | --- | --- | --- | --- |
| B1 | 8 | Shows cover status | Open dashboard with device running | "OPEN" or "CLOSED" matches the real lid | |
| B2 | 8 | Shows rain condition | Drip water on sensor | "Rain Detected" appears; "No Rain" when dry | |
| B3 | 8 | Real-time update | Keep app open while changing rain | Screen updates without refreshing | |
| B4 | 7 | Last updated | Change the state | "Last updated" shows the new time | |
| B5 | 7 | Control mode shown | Press Open | Mode shows "Manual"; "Automatic" after rain status changes | |
| B6 | 9 | Open button | Tap Open cover | Lid opens, "Open command sent" message | |
| B7 | 9 | Close button | Tap Close cover | Lid closes, "Close command sent" message | |
| B8 | - | Pending command text | Tap Open while the ESP32 is unplugged | "Waiting for the device..." appears | |
| B9 | - | Offline indicator | Turn phone internet off | Indicator shows "Offline"; buttons show an offline message | |
| B10 | - | Empty database | Delete `umbrellaCover` in console | "Waiting for the first status..." message, no crash | |

## C. Firmware and hardware (ESP32)

| ID | FRS | Test | Steps | Expected result | Result |
| --- | --- | --- | --- | --- | --- |
| C1 | 1 | Sensor reads | Serial Monitor at 115200 | New reading about every 2 s | |
| C2 | 2 | Averaging | Watch readings on a dry plate | Values are stable (little jitter) | |
| C3 | 3 | Single drop does not trigger | One quick drop, wipe it away | No status change if it dries within about 6 s | |
| C4 | 3, 4 | Rain confirmed, cover opens | Keep the plate wet | After about 6 s: `Rain status confirmed: RAIN`, lid opens | |
| C5 | 4 | Cover opens smoothly | Watch the servo | Gentle movement to the open angle | |
| C6 | 5 | Cover closes after dry delay | Dry the plate | After about 6 s No Rain, after the dry delay lid closes | |
| C7 | 5 | Rain returns during dry delay | Wet the plate again before the delay ends | Lid stays open, delay restarts | |
| C8 | 10 | Manual open has priority | Tap Open in dry weather | Lid opens; no automatic close while mode is Manual | |
| C9 | 10 | Manual close has priority | Tap Close while it is raining | Lid closes and stays closed | |
| C10 | 11 | Return to automatic | After a manual command, change the rain status | Mode returns to Automatic, normal rules apply | |
| C11 | 7 | State published | Watch Firebase console during changes | rainStatus, coverStatus, controlMode, updatedAt update | |
| C12 | 10 | Command cleared | Tap Open | `command` returns to `NONE` in Firebase | |
| C13 | - | Stale command ignored at boot | Set `command` to `OPEN` in console, then reset the ESP32 | Lid does not open; `command` is reset to `NONE` | |
| C14 | 6 | Connects to Wi-Fi | Power on | Serial shows "Wi-Fi connected, starting Firebase" | |
| C15 | - | LED | Open and close the cover | LED on while open, off while closed | |

## D. Offline behavior and recovery

| ID | FRS | Test | Steps | Expected result | Result |
| --- | --- | --- | --- | --- | --- |
| D1 | 12 | Automatic control without Wi-Fi | Turn the router off, wet the plate | Lid still opens and closes by itself | |
| D2 | 12 | Re-sync after reconnect | Turn the router on again | Firebase and app show the current state within about 1 minute | |
| D3 | 12 | Manual command while ESP32 is offline | Tap Open while the router is off, then turn it on | Command is executed when the device reconnects | |
| D4 | - | Power cycle | Unplug and replug the ESP32 (lid closed) | Starts in Closed / Automatic and re-syncs | |

## E. Security (Firebase rules)

| ID | FRS | Test | Steps | Expected result | Result |
| --- | --- | --- | --- | --- | --- |
| E1 | - | Reading needs login | Open the database URL + `/umbrellaCover.json` in a browser | "Permission denied" | |
| E2 | - | App users cannot change sensor fields | In the Rules Playground, simulate an authenticated user writing `rainStatus` | Write denied | |
| E3 | - | Invalid command value | Write `command = "HELLO"` from the Rules Playground | Write denied | |
| E4 | - | Users see only their own profile | Simulate user A reading `/users/<uid of B>` | Read denied | |
| E5 | - | Device account can write status | Simulate `device@pluvia.app` writing `coverStatus = OPEN` | Write allowed | |

## F. Simulator (no hardware needed)

Sections A to E need the physical device. This section verifies the same
requirements against the live database using the simulator, so the MVP can be
confirmed before the hardware exists. Already run, all passing.

```
cd firmware/simulator
npm run demo
```

Expected last line: `31 passed, 0 failed`.

| ID | FRS | Test | How the simulator proves it |
| --- | --- | --- | --- |
| F1 | 1-2 | Sensor read and averaged | Averages 10 samples with noise; publishes the value as `rainLevel` |
| F2 | 3 | Two wet readings do not trigger | Cover stays CLOSED after 2 wet readings |
| F3 | 3 | Third matching reading confirms | `rainStatus` becomes RAIN on the 3rd |
| F4 | 4 | Cover opens automatically | `coverStatus` becomes OPEN, published to Firebase |
| F5 | 5 | Cover stays open during the dry delay | Still OPEN inside the delay window |
| F6 | 5 | Cover closes after the delay | CLOSED once 3 intervals pass |
| F7 | 7 | Four fields published | rainStatus, coverStatus, controlMode, updatedAt all present and fresh |
| F8 | 9-10 | Command reaches the device | Writing `command: OPEN` opens the cover, mode MANUAL |
| F9 | 10 | Command cleared | `command` returns to NONE |
| F10 | 11 | Back to automatic on rain change | Mode returns to AUTO when rain status changes |
| F11 | 10 | Manual overrides rain | CLOSE works while raining, stays closed |
| F12 | 12 | Works without Wi-Fi | With the network off the cover opens locally, Firebase keeps the old value |
| F13 | 12 | Re-syncs on reconnect | State catches up one interval after the network returns |
| F14 | - | Heartbeat | `device/lastSeen` written and recent |

## Firmware logic unit tests (PC)

The same 41 assertions run without a C++ compiler, against the JavaScript port of
the firmware logic:

```
cd firmware/simulator
npm test
```

Expected last line: `41 passed, 0 failed`.

With g++ available, run the original C++ tests as well:

```
cd firmware/tests
g++ -std=c++11 -Wall -I../Pluvia test_logic.cpp -o test_logic
./test_logic
```
