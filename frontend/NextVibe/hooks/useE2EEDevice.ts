import { useEffect } from "react";
import CryptoService from "@/src/services/CryptoService";

/**
 * Publishes this phone's chat key once someone is signed in (launch and every
 * sign-in), so others can send it end-to-end encrypted messages right away.
 */
export function useE2EEDevice(userId: number | null) {
    useEffect(() => {
        if (userId) CryptoService.ensurePublished(userId);
    }, [userId]);
}
