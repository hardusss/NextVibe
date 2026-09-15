/**
 * Tunables for phone-to-phone taps that can change with an OTA update.
 */

/**
 * Bluetooth: minimum averaged signal (dBm) for a phone to count as tapped.
 * −45 ≈ phones touching or a couple of centimetres apart; −50 already
 * reached 20–30 cm and picked up several phones at once. Raise towards −40
 * for stricter, lower towards −50 if taps through thick cases get missed.
 */
export const BLE_TAP_RSSI_DBM = -45;
