#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <AccelStepper.h>

// ================= CONFIG =================
const char* WIFI_SSID = "Hotspot ni Jholo";
const char* WIFI_PASS = "88888888";

const char* FB_HOST   = "pluvia-app-default-rtdb.asia-southeast1.firebasedatabase.app"; 
const char* FB_KEY    = "AIzaSyA3oKDDtnYp1Jqo8tQX92S6BgnyTwbdyDc";
const char* FB_EMAIL  = "device@pluvia.app"; 
const char* FB_PASS   = "Pluvia11"; 
// ==========================================

const int PIN_RAIN = 34;
const int PIN_LED  = 2;

const int IN1 = 18;
const int IN2 = 19;
const int IN3 = 21;
const int IN4 = 22;

const int BTN_FORWARD = 25;  
const int BTN_BACKWARD = 26; 

AccelStepper cover(AccelStepper::FULL4WIRE, IN1, IN3, IN2, IN4);

const long STEPS_TO_OPEN = 2048 * 4.5;  // 9216 steps
const long STEPS_TO_CLOSE = 0;        

const uint32_t SAMPLE_PERIOD_MS = 2000;
const int SAMPLES = 10;
const uint32_t SAMPLE_GAP_MS = 20;

int RAIN_LEVEL = 3100;
int DRY_LEVEL  = 3300;
const int CONFIRM_COUNT = 3;

// Changed to 10 seconds for faster response during demos/testing
const uint32_t DRY_DELAY_MS = 10000UL; 
const uint32_t HEARTBEAT_INTERVAL = 10000UL;

String rainStatus  = "NO_RAIN";
String coverStatus = "CLOSED";
String controlMode = "AUTO";

long lastSensorReading = 0;
String pending = "NO_RAIN";
int confirmCnt = 0;
uint32_t noRainSince = 0;
bool firebaseDirty = true;

String idToken = "";
uint32_t tokenExpiresAt = 0;

void autoControl();
void setCover(const String &target);
void fbSyncStatus();

// ---------------- FIREBASE FUNCTIONS ----------------
bool fbSignIn() {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  String url = String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + FB_KEY;
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  String body = String("{\"email\":\"") + FB_EMAIL + "\",\"password\":\"" + FB_PASS + "\",\"returnSecureToken\":true}";
  int code = http.POST(body);
  if (code == 200) {
    StaticJsonDocument<2048> doc;
    if (!deserializeJson(doc, http.getString())) {
      idToken = doc["idToken"].as<String>();
      long expiresSec = doc["expiresIn"].as<String>().toInt();
      tokenExpiresAt = millis() + expiresSec * 1000UL - 60000UL;
      Serial.println("[FB] Signed in");
      http.end(); return true;
    }
  }
  Serial.printf("[FB] Sign-in failed: HTTP %d\n", code);
  http.end(); return false;
}

bool fbPatch(String path, const String &json) {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  String url = String("https://") + FB_HOST + path + ".json?auth=" + idToken;
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  int code = http.sendRequest("PATCH", json);
  if (code == 401) tokenExpiresAt = 0;
  http.end();
  return code == 200;
}

void fbSyncStatus() {
  if (!firebaseDirty || WiFi.status() != WL_CONNECTED || idToken == "") return;
  String payload = "{\"rainStatus\":\"" + rainStatus +
                   "\",\"coverStatus\":\"" + coverStatus +
                   "\",\"controlMode\":\"" + controlMode +
                   "\",\"rainLevel\":" + String(lastSensorReading) +
                   ",\"updatedAt\":{\".sv\":\"timestamp\"}}";
  if (fbPatch("/umbrellaCover", payload)) {
    firebaseDirty = false;
  }
}

void fbSendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED || idToken == "") return;
  fbPatch("/device", "{\"lastSeen\":{\".sv\":\"timestamp\"}}");
}

void fbGetMode() {
  if (WiFi.status() != WL_CONNECTED || idToken == "") return;
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  String url = String("https://") + FB_HOST + "/umbrellaCover/controlMode.json?auth=" + idToken;
  if (!http.begin(client, url)) return;
  int code = http.GET();
  if (code == 200) {
    String mode = http.getString();
    mode.replace("\"", "");
    mode.trim();
    if ((mode == "AUTO" || mode == "MANUAL") && mode != controlMode) {
      controlMode = mode;
      firebaseDirty = true;
      Serial.printf("[MODE] %s\n", controlMode.c_str());
      if (controlMode == "AUTO") autoControl();
    }
  }
  http.end();
}

void pollCommand() {
  if (WiFi.status() != WL_CONNECTED || idToken == "") return;
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  String url = String("https://") + FB_HOST + "/umbrellaCover/command.json?auth=" + idToken;
  if (!http.begin(client, url)) return;
  int code = http.GET();
  if (code == 200) {
    String cmd = http.getString();
    cmd.replace("\"", "");
    cmd.trim();
    if (cmd == "OPEN" || cmd == "CLOSE") {
      controlMode = "MANUAL";
      firebaseDirty = true;
      Serial.printf("[CMD] App Manual %s\n", cmd.c_str());
      fbPatch("/umbrellaCover", "{\"command\":\"NONE\"}");
      setCover(cmd);
    }
  }
  http.end();
}

// ---------------- MOTOR CONTROL ----------------
void setCover(const String &target) {
  long targetPos = (target == "OPEN") ? STEPS_TO_OPEN : STEPS_TO_CLOSE;
  
  Serial.printf("[MOTOR CHECK] Current Pos: %ld | Target: %ld\n", cover.currentPosition(), targetPos);

  if (cover.currentPosition() == targetPos) {
    Serial.println("[MOTOR] Already at target. Not moving.");
    coverStatus = (target == "OPEN") ? "OPEN" : "CLOSED";
    digitalWrite(PIN_LED, coverStatus == "OPEN" ? HIGH : LOW);
    firebaseDirty = true;
    return;
  }

  cover.moveTo(targetPos);
  Serial.printf("[MOTOR] Moving to %s...\n", target.c_str());
  
  unsigned long startTime = millis();
  bool timedOut = false;

  while (cover.distanceToGo() != 0) {
    cover.run();
    if (millis() - startTime > 90000) {
      timedOut = true;
      break;
    }
  }
  
  if (timedOut) {
    Serial.println("[MOTOR ERROR] Timed out! Motor might be stuck or too heavy.");
    cover.setCurrentPosition(targetPos); 
  } else {
    Serial.printf("[MOTOR] Done. Position: %ld\n", cover.currentPosition());
  }

  coverStatus = (target == "OPEN") ? "OPEN" : "CLOSED";
  digitalWrite(PIN_LED, coverStatus == "OPEN" ? HIGH : LOW);
  firebaseDirty = true;
}

long readAverage() {
  long sum = 0;
  for (int i = 0; i < SAMPLES; i++) { sum += analogRead(PIN_RAIN); delay(SAMPLE_GAP_MS); }
  return sum / SAMPLES;
}

void processRain(long avg) {
  lastSensorReading = avg;
  Serial.printf("[SENSOR] Avg: %ld\n", avg); 

  if (avg < 100) return; 

  String cand;
  if (rainStatus == "NO_RAIN") cand = (avg < RAIN_LEVEL) ? "RAIN" : "NO_RAIN";
  else                         cand = (avg > DRY_LEVEL)  ? "NO_RAIN" : "RAIN";

  if (cand == pending) confirmCnt++;
  else { pending = cand; confirmCnt = 1; }

  if (confirmCnt >= CONFIRM_COUNT && pending != rainStatus) {
    rainStatus = pending;
    confirmCnt = 0;
    if (rainStatus == "NO_RAIN") noRainSince = millis();
    firebaseDirty = true;
    Serial.printf("[RAIN] %s (avg %ld)\n", rainStatus.c_str(), avg);
  }
}

void autoControl() {
  if (controlMode != "AUTO") return;
  
  // When it rains, CLOSE the roof (roll it up)
  if (rainStatus == "RAIN" && coverStatus == "OPEN") {
    Serial.println("[AUTO] Rain detected -> CLOSING roof.");
    setCover("CLOSE");
  } 
  // When it's dry, OPEN the roof (unroll it)
  else if (rainStatus == "NO_RAIN" && coverStatus == "CLOSED") {
    if (millis() - noRainSince >= DRY_DELAY_MS) {
      Serial.println("[AUTO] No Rain -> OPENING roof.");
      setCover("OPEN");
    }
  }
}

// ---------------- SETUP & LOOP ----------------
uint32_t lastSample = 0, lastPoll = 0, lastHeartbeat = 0, lastWifiTry = 0;
bool lastBtnF = HIGH;
bool lastBtnB = HIGH;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(PIN_LED, OUTPUT);
  pinMode(BTN_FORWARD, INPUT_PULLUP);
  pinMode(BTN_BACKWARD, INPUT_PULLUP);

  // --- FASTER SPEED SETTINGS ---
  cover.setMaxSpeed(300.0);       // Increased speed
  cover.setAcceleration(50.0);   // Increased acceleration
  cover.setCurrentPosition(0);    

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Wi-Fi");
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) { delay(300); Serial.print("."); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " Connected" : " Offline");

  if (WiFi.status() == WL_CONNECTED) fbSignIn();
  noRainSince = millis();
  lastSample = lastPoll = lastHeartbeat = millis();
}

void loop() {
  uint32_t now = millis();

  bool btnF = (digitalRead(BTN_FORWARD) == LOW);
  bool btnB = (digitalRead(BTN_BACKWARD) == LOW);
  
  if (btnF && !lastBtnF) {
    if (controlMode != "MANUAL") {
      controlMode = "MANUAL";
      firebaseDirty = true;
      Serial.println("[MODE] MANUAL via Button");
    }
    setCover("OPEN");
  }
  if (btnB && !lastBtnB) {
    if (controlMode != "MANUAL") {
      controlMode = "MANUAL";
      firebaseDirty = true;
      Serial.println("[MODE] MANUAL via Button");
    }
    setCover("CLOSE");
  }
  lastBtnF = btnF;
  lastBtnB = btnB;

  if (WiFi.status() != WL_CONNECTED && now - lastWifiTry > 5000) {
    lastWifiTry = now;
    WiFi.reconnect();
  }
  if (WiFi.status() == WL_CONNECTED && (idToken == "" || now > tokenExpiresAt)) {
    fbSignIn();
  }

  if (now - lastSample >= SAMPLE_PERIOD_MS) {
    lastSample = now;
    long avg = readAverage();
    processRain(avg);
    autoControl();
  }

  if (now - lastPoll >= 2000) {
    lastPoll = now;
    pollCommand();
    fbGetMode();
    fbSyncStatus();
  }

  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = now;
    fbSendHeartbeat();
  }
}