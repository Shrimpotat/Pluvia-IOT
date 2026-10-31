#include <ESP32Servo.h>

Servo myServo;  // Create a servo object

void setup() {
  // Set a standard servo frequency and attach the servo to pin 13
  myServo.setPeriodHertz(50);
  myServo.attach(13, 500, 2400);  // Pin 13, min pulse, max pulse
}

void loop() {
  // Sweep from 0 to 180 degrees, 2 degrees at a time
  for (int pos = 0; pos <= 180; pos += 2) {
    myServo.write(pos);
    delay(15);  // Small delay so the motion is visible
  }
  // Sweep back from 180 to 0 degrees
  for (int pos = 180; pos >= 0; pos -= 2) {
    myServo.write(pos);
    delay(15);
  }
}