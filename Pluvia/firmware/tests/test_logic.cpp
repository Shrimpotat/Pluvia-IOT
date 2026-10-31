// Host-side tests for PluviaLogic.h. Build and run on a PC:
//   g++ -std=c++11 -Wall -I../Pluvia test_logic.cpp -o test_logic && ./test_logic
#include <cstdio>
#include "PluviaLogic.h"
using namespace pluvia;

static int passed = 0, failed = 0;
#define CHECK(name, cond)                                  \
  do {                                                     \
    if (cond) { passed++; printf("  PASS  %s\n", name); }  \
    else      { failed++; printf("  FAIL  %s\n", name); }  \
  } while (0)

// Same values as the defaults in config.h
static const int THRESH = 3000, HYST = 200, CONFIRM = 3;
static const uint32_t DRY = 120000;
static const int DRY_READING = 4000, WET_READING = 1200, BAND_READING = 3100;

// One simulated device: detector + controller, 2 seconds per reading.
struct Rig {
  RainDetector det{THRESH, HYST, CONFIRM};
  CoverController ctl{DRY};
  uint32_t now = 0;
  // Feeds one reading; returns true if the cover must move.
  bool feed(int reading) {
    now += 2000;
    if (det.update(reading)) return ctl.onRainChanged(det.state(), now);
    return false;
  }
  void feedN(int reading, int n) { for (int i = 0; i < n; i++) feed(reading); }
};

int main() {
  printf("RainDetector\n");
  {
    RainDetector d(THRESH, HYST, CONFIRM);
    CHECK("starts as NO_RAIN", d.state() == NO_RAIN);
    CHECK("dry readings change nothing", !d.update(4000) && !d.update(4000) && d.state() == NO_RAIN);
    CHECK("1st wet reading not confirmed", !d.update(WET_READING) && d.state() == NO_RAIN);
    CHECK("2nd wet reading not confirmed", !d.update(WET_READING) && d.state() == NO_RAIN);
    CHECK("3rd wet reading confirms RAIN", d.update(WET_READING) && d.state() == RAIN);
  }
  {
    RainDetector d(THRESH, HYST, CONFIRM);
    d.update(WET_READING); d.update(WET_READING);
    d.update(DRY_READING);  // streak broken
    d.update(WET_READING); d.update(WET_READING);
    CHECK("interrupted streak does not confirm", d.state() == NO_RAIN);
    CHECK("a full new streak confirms", d.update(WET_READING) && d.state() == RAIN);
  }
  {
    RainDetector d(THRESH, HYST, CONFIRM);
    for (int i = 0; i < 3; i++) d.update(WET_READING);
    bool changed = false;
    for (int i = 0; i < 10; i++) changed |= d.update(BAND_READING);  // 3100 is inside the hysteresis band
    CHECK("reading inside hysteresis band keeps RAIN", !changed && d.state() == RAIN);
    d.update(3201); d.update(3201);
    CHECK("two dry readings are not enough to end rain", d.state() == RAIN);
    CHECK("third reading above threshold+hysteresis ends rain", d.update(3201) && d.state() == NO_RAIN);
  }
  {
    RainDetector d(THRESH, HYST, CONFIRM);
    bool changed = false;
    for (int i = 0; i < 10; i++) changed |= d.update(3000);  // exactly the threshold is not "below"
    CHECK("reading equal to threshold is not rain", !changed);
  }

  printf("Automatic control\n");
  {
    Rig r;
    CHECK("boot state: closed, AUTO, no rain",
          r.ctl.cover() == COVER_CLOSED && r.ctl.mode() == MODE_AUTO && r.ctl.rain() == NO_RAIN);
    r.feedN(WET_READING, 2);
    CHECK("cover stays closed before rain is confirmed", r.ctl.cover() == COVER_CLOSED);
    bool move = r.feed(WET_READING);
    CHECK("rain confirmed -> cover opens", move && r.ctl.cover() == COVER_OPEN && r.ctl.rain() == RAIN);
    CHECK("change is flagged for Firebase sync", r.ctl.consumeDirty());
    CHECK("dirty flag clears once consumed", !r.ctl.consumeDirty());

    r.feedN(DRY_READING, 3);
    CHECK("rain stopped but cover stays open during dry delay",
          r.ctl.cover() == COVER_OPEN && r.ctl.rain() == NO_RAIN);
    CHECK("tick just before the dry delay does nothing", !r.ctl.tick(r.now + 119999) && r.ctl.cover() == COVER_OPEN);
    CHECK("tick after the dry delay closes the cover", r.ctl.tick(r.now + 120000) && r.ctl.cover() == COVER_CLOSED);
    CHECK("tick does not close twice", !r.ctl.tick(r.now + 500000));
  }
  {
    Rig r;  // rain returns during the dry delay: timer restarts, cover never closes meanwhile
    r.feedN(WET_READING, 3);
    r.feedN(DRY_READING, 3);
    uint32_t firstDryStart = r.now;
    CHECK("still open 60 s into the dry delay", !r.ctl.tick(firstDryStart + 60000));
    r.feedN(WET_READING, 3);   // rain returns
    CHECK("no close while it is raining", !r.ctl.tick(r.now + 1000000) && r.ctl.cover() == COVER_OPEN);
    r.feedN(DRY_READING, 3);   // stops again: timer restarts from now
    uint32_t secondDryStart = r.now;
    CHECK("timer restarted: not closed 100 s after the 2nd dry start",
          !r.ctl.tick(secondDryStart + 100000) && r.ctl.cover() == COVER_OPEN);
    CHECK("closes after the 2nd full dry period",
          r.ctl.tick(secondDryStart + 120000) && r.ctl.cover() == COVER_CLOSED);
  }

  printf("Manual control\n");
  {
    Rig r;
    r.ctl.consumeDirty();
    CHECK("OPEN command opens a closed cover", r.ctl.onCommand(CMD_OPEN) && r.ctl.cover() == COVER_OPEN);
    CHECK("OPEN command switches to MANUAL", r.ctl.mode() == MODE_MANUAL);
    CHECK("manual change is flagged for sync", r.ctl.consumeDirty());
    CHECK("automatic closing is blocked in MANUAL", !r.ctl.tick(r.now + 10000000) && r.ctl.cover() == COVER_OPEN);
    CHECK("CLOSE command closes it", r.ctl.onCommand(CMD_CLOSE) && r.ctl.cover() == COVER_CLOSED);
  }
  {
    Rig r;
    r.ctl.consumeDirty();
    CHECK("CMD_NONE is ignored", !r.ctl.onCommand(CMD_NONE) && r.ctl.mode() == MODE_AUTO && !r.ctl.consumeDirty());
    CHECK("CLOSE on an already closed cover does not move it", !r.ctl.onCommand(CMD_CLOSE));
    CHECK("...but still switches to MANUAL and is synced", r.ctl.mode() == MODE_MANUAL && r.ctl.consumeDirty());
  }
  {
    Rig r;
    r.feedN(WET_READING, 3);                           // opens automatically
    r.ctl.onCommand(CMD_CLOSE);                        // user closes it during rain
    CHECK("user can close during rain", r.ctl.cover() == COVER_CLOSED && r.ctl.mode() == MODE_MANUAL);
    CHECK("cover stays closed while rain status is unchanged", !r.ctl.tick(r.now + 1000000));
    r.feedN(DRY_READING, 3);                           // rain stops -> back to AUTO
    CHECK("rain status change returns control to AUTO", r.ctl.mode() == MODE_AUTO);
    CHECK("cover remains closed afterwards", r.ctl.cover() == COVER_CLOSED && !r.ctl.tick(r.now + 1000000));
    bool move = false;
    for (int i = 0; i < 3; i++) move |= r.feed(WET_READING);  // next rain opens it again
    CHECK("next rain opens the cover in AUTO", move && r.ctl.cover() == COVER_OPEN);
  }
  {
    Rig r;
    r.ctl.onCommand(CMD_OPEN);                         // user opens in dry weather (MANUAL)
    r.feedN(WET_READING, 3);                           // rain starts -> AUTO, already open
    CHECK("rain while manually open: back to AUTO, stays open",
          r.ctl.mode() == MODE_AUTO && r.ctl.cover() == COVER_OPEN);
    r.feedN(DRY_READING, 3);
    CHECK("then closes after the dry delay", r.ctl.tick(r.now + 120000) && r.ctl.cover() == COVER_CLOSED);
  }
  {
    Rig r;
    r.feedN(WET_READING, 3);
    r.feedN(DRY_READING, 3);
    r.ctl.onCommand(CMD_OPEN);                         // manual during the dry delay
    CHECK("manual command cancels the pending automatic close",
          !r.ctl.tick(r.now + 1000000) && r.ctl.cover() == COVER_OPEN);
  }

  printf("Timer rollover\n");
  {
    CoverController c(120000);
    c.onRainChanged(RAIN, 4294960000u);                // near the 32-bit millis() limit
    c.onRainChanged(NO_RAIN, 4294960000u);
    CHECK("dry delay works across millis() overflow",
          !c.tick(4294960000u + 100000u) && c.tick(4294960000u + 120000u));
  }

  printf("\n%d passed, %d failed\n", passed, failed);
  return failed ? 1 : 0;
}
