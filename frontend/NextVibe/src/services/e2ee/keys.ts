/**
 * This phone's chat key and the other side's public keys.
 *
 * - The key pair lives in SecureStore, per account (e2ee_device_v3_<userId>);
 *   it is made once and published to the realtime API (POST /e2ee/devices).
 * - Device lists come from GET /e2ee/devices, cached for a minute in memory
 *   and kept in storage, so a message sent offline still reaches every device
 *   seen last time.
 */
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { storage } from '../../utils/storage';
import GetApiUrl from '../../utils/url_api';
import { newDeviceKeyPair, isValidPublicKey, type DeviceKeyPair, type PublicDevice } from './core';

const DEVICE_KEY_PREFIX = 'e2ee_device_v3_';
const DEVICE_LIST_PREFIX = 'e2ee_devices_v3_';
const LIST_TTL_MS = 60 * 1000;

export function realtimeBaseUrl(): string {
    return GetApiUrl().replace('api', 'realtime').replace(':8000', ':8081').replace('v1', 'v2');
}

async function authHeaders() {
    const token = await storage.getItem('access');
    return token ? { Authorization: `Bearer ${token}` } : null;
}

const loading = new Map<number, Promise<DeviceKeyPair>>();
const published = new Set<string>();
const memory = new Map<number, { at: number; devices: PublicDevice[] }>();

/** This phone's key pair for the account, made on first use. */
export function getDeviceKey(userId: number): Promise<DeviceKeyPair> {
    let pending = loading.get(userId);
    if (!pending) {
        pending = (async () => {
            const name = `${DEVICE_KEY_PREFIX}${userId}`;
            const stored = await SecureStore.getItemAsync(name);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored) as DeviceKeyPair;
                    if (parsed.deviceId && isValidPublicKey(parsed.publicKey) && parsed.secretKey) return parsed;
                } catch {
                    // A broken entry is replaced below
                }
            }
            const fresh = newDeviceKeyPair();
            await SecureStore.setItemAsync(name, JSON.stringify(fresh));
            return fresh;
        })();
        pending.catch(() => loading.delete(userId));
        loading.set(userId, pending);
    }
    return pending;
}

/** Publishes this phone's public key (once per app run); others can then seal messages for it. */
export async function publishDeviceKey(userId: number): Promise<boolean> {
    const device = await getDeviceKey(userId);
    const marker = `${userId}:${device.deviceId}`;
    if (published.has(marker)) return true;
    const headers = await authHeaders();
    if (!headers) return false;
    try {
        await axios.post(`${realtimeBaseUrl()}/e2ee/devices`,
            { device_id: device.deviceId, public_key: device.publicKey }, { headers, timeout: 15000 });
        published.add(marker);
        memory.delete(userId);
        return true;
    } catch {
        return false;
    }
}

type DeviceLists = Record<number, PublicDevice[]>;

const clean = (list: unknown): PublicDevice[] =>
    Array.isArray(list)
        ? list.filter((d: any) => d && typeof d.device_id === 'string' && isValidPublicKey(d.public_key))
        : [];

/**
 * Public keys of every device of these people. Offline or on an error, the
 * last list seen is used; `null` for someone means nothing is known yet.
 */
export async function getDevices(userIds: number[], fresh = false): Promise<Record<number, PublicDevice[] | null>> {
    const ids = [...new Set(userIds.filter((id) => Number.isFinite(id) && id > 0))];
    const result: Record<number, PublicDevice[] | null> = {};
    const now = Date.now();
    const missing = ids.filter((id) => {
        const hit = memory.get(id);
        if (!fresh && hit && now - hit.at < LIST_TTL_MS) {
            result[id] = hit.devices;
            return false;
        }
        return true;
    });
    if (missing.length === 0) return result;

    let fetched: DeviceLists | null = null;
    const headers = await authHeaders();
    if (headers) {
        try {
            const res = await axios.get(`${realtimeBaseUrl()}/e2ee/devices`,
                { params: { user_ids: missing.join(',') }, headers, timeout: 10000 });
            fetched = {};
            for (const id of missing) fetched[id] = clean(res.data?.devices?.[String(id)]);
        } catch {
            fetched = null;
        }
    }

    for (const id of missing) {
        if (fetched) {
            memory.set(id, { at: now, devices: fetched[id] });
            result[id] = fetched[id];
            storage.setItem(`${DEVICE_LIST_PREFIX}${id}`, JSON.stringify(fetched[id])).catch(() => {});
        } else {
            try {
                const saved = await storage.getItem(`${DEVICE_LIST_PREFIX}${id}`);
                result[id] = saved ? clean(JSON.parse(saved)) : null;
            } catch {
                result[id] = null;
            }
        }
    }
    return result;
}

/** For tests. */
export function resetKeyCaches() {
    loading.clear();
    published.clear();
    memory.clear();
}
