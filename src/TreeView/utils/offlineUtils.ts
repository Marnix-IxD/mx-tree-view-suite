import { useEffect, useState } from "react";

/**
 * Simple hook to detect offline status using native browser API
 * When offline, the tree widget should be disabled entirely
 */
export function useOfflineStatus(): boolean {
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    return isOffline;
}

/**
 * Check if currently offline
 */
export function isOffline(): boolean {
    return !navigator.onLine;
}
