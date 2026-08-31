
import { useState, useEffect } from "react";

export function usePersistentToggle(key: string, defaultValue: boolean) {
    const [value, setValue] = useState<boolean>(() => {
        try {
            const stored = localStorage.getItem(key);
            if (stored !== null) {
                return JSON.parse(stored);
            }
        } catch {
            // ignore
        }
        return defaultValue;
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // ignore
        }
    }, [key, value]);

    const toggle = () => setValue((prev) => !prev);
    const set = (v: boolean) => setValue(v);

    return [value, toggle, set] as const;
}
