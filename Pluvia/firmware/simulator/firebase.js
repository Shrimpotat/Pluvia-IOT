// firebase.js
// Talks to the live Firebase project using the REST API, signed in as the device
// account. No SDK and no dependencies: Node's built-in fetch is enough.
//
// The device account is the same one the ESP32 uses, so the simulator writes
// through exactly the same database rules the real firmware does.

'use strict';

const API_KEY = process.env.PLUVIA_API_KEY || 'AIzaSyA3oKDDtnYp1Jqo8tQX92S6BgnyTwbdyDc';
const DATABASE_URL =
  process.env.PLUVIA_DATABASE_URL ||
  'https://pluvia-app-default-rtdb.asia-southeast1.firebasedatabase.app';
const DEVICE_EMAIL = process.env.PLUVIA_DEVICE_EMAIL || 'device@pluvia.app';
const DEVICE_PASSWORD = process.env.PLUVIA_DEVICE_PASSWORD || 'PluviaDevice2026';

const PATHS = {
  rainStatus: 'umbrellaCover/rainStatus',
  coverStatus: 'umbrellaCover/coverStatus',
  controlMode: 'umbrellaCover/controlMode',
  command: 'umbrellaCover/command',
  updatedAt: 'umbrellaCover/updatedAt',
  rainLevel: 'umbrellaCover/rainLevel',
  deviceInfo: 'device/info',
  lastSeen: 'device/lastSeen',
};

class FirebaseError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'FirebaseError';
    this.status = status;
  }
}

/** Signs in and keeps the ID token fresh, like the ESP32 token helper does. */
class DeviceSession {
  constructor(apiKey = API_KEY) {
    this.apiKey = apiKey;
    this.idToken = null;
    this.expiresAt = 0;
  }

  async token() {
    // Refresh a minute early so a request never starts with an expired token.
    if (this.idToken && Date.now() < this.expiresAt - 60_000) return this.idToken;
    await this.signIn();
    return this.idToken;
  }

  async signIn() {
    const url =
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DEVICE_EMAIL, password: DEVICE_PASSWORD, returnSecureToken: true }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new FirebaseError(`device sign-in failed: ${body}`, res.status);
    }
    const data = await res.json();
    this.idToken = data.idToken;
    // expiresIn comes back in seconds as a string.
    this.expiresAt = Date.now() + Number(data.expiresIn || 3600) * 1000;
    return data;
  }
}

/** Realtime Database REST helpers scoped to one signed-in device account. */
class Database {
  constructor(session, baseUrl = DATABASE_URL) {
    this.session = session;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async request(method, path, body) {
    const token = await this.session.token();
    const url = `${this.baseUrl}/${path}.json?auth=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new FirebaseError(`${method} ${path} failed: ${text}`, res.status);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  get(path) { return this.request('GET', path); }

  set(path, value) { return this.request('PUT', path, value); }

  update(path, value) { return this.request('PATCH', path, value); }

  /**
   * Writes the Firebase server clock into a node.
   *
   * This has to be a PUT, not a PATCH. The placeholder is the value at the
   * target path, and a PATCH body is read as a set of child keys, where `.sv` is
   * not a legal key name.
   */
  setServerTime(path) {
    return this.request('PUT', path, { '.sv': 'timestamp' });
  }

  /**
   * Writes the five MVP fields. Each field is written separately on purpose:
   * the database rules check each one, and the firmware does the same.
   */
  async pushState(state) {
    await this.set(PATHS.rainStatus, state.rainStatus);
    await this.set(PATHS.coverStatus, state.coverStatus);
    await this.set(PATHS.controlMode, state.controlMode);
    if (state.rainLevel !== undefined) await this.set(PATHS.rainLevel, state.rainLevel);
    await this.setServerTime(PATHS.updatedAt);
    await this.setServerTime(PATHS.lastSeen);
  }

  async clearCommand() {
    await this.set(PATHS.command, 'NONE');
  }

  async readCommand() {
    const value = await this.get(PATHS.command);
    return typeof value === 'string' ? value : 'NONE';
  }

  async announceDevice(info) {
    await this.set(PATHS.deviceInfo, info);
  }
}

module.exports = {
  API_KEY, DATABASE_URL, DEVICE_EMAIL, DEVICE_PASSWORD,
  PATHS, FirebaseError, DeviceSession, Database,
};