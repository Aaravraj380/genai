/**
 * Works out where the backend is, so most people never have to type it.
 *
 *  1. EXPO_PUBLIC_API_URL, if set (e.g. in frontend/.env)
 *  2. Web: the same computer that serves the page, port 8000
 *  3. Phone with Expo Go: the computer running `npx expo start` (from the QR code), port 8000
 *  4. Fallback: http://localhost:8000
 *
 * The user can always override it in Account → Server address.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const API_PORT = 8000;

export function defaultApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:${API_PORT}`;
  }

  // e.g. "192.168.1.20:8081" when the phone loaded the app from your computer.
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  // Tunnel addresses (*.exp.direct) can't reach port 8000 — the user must enter the address.
  if (host && !host.endsWith('.exp.direct')) return `http://${host}:${API_PORT}`;

  return `http://localhost:${API_PORT}`;
}
