import { jwtDecode } from "jwt-decode";

export function isTokenExpiringSoon(token: string, thresholdSeconds = 30) {
    try {
        const decoded = jwtDecode(token); 
        const now = Math.floor(Date.now() / 1000);
        
        if (decoded.exp) {
            decoded.exp - now < thresholdSeconds
        };
    } catch (e) {
        return true; 
    }
}
