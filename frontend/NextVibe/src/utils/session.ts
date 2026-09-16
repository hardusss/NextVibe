import { storage } from './storage';

/**
 * Is anyone signed in on this device? Used to keep background pollers quiet
 * after a logout: their 401s used to bounce the person back to /register
 * every 30s, wiping whatever they were typing on the sign-in form.
 */
export async function hasSession(): Promise<boolean> {
    try {
        return !!(await storage.getItem('access'));
    } catch {
        return false;
    }
}
