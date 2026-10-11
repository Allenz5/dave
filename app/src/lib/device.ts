import 'expo-sqlite/localStorage/install';
import { randomUUID } from 'expo-crypto';

// No login: each device generates a fixed ID that identifies its votes and comments.
export function getDeviceId(): string {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = randomUUID();
    localStorage.setItem('device_id', id);
  }
  return id;
}
