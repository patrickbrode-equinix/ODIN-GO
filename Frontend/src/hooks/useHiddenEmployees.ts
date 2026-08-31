
import { useState, useEffect, useCallback } from "react";

const HIDDEN_KEY = "oes_shiftplan_hidden_employees_v1";
const EVENT_KEY = "oes_shiftplan_hidden_changed";

function getHiddenSet(): Set<string> {
    try {
        const raw = localStorage.getItem(HIDDEN_KEY);
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                return new Set(arr.filter((x) => typeof x === "string"));
            }
        }
    } catch (e) {
        console.warn("hiddenEmployees load failed", e);
    }
    return new Set();
}

export function useHiddenEmployees() {
    const [hiddenEmployees, setHiddenEmployees] = useState<Set<string>>(getHiddenSet);
    const [isLoaded, setIsLoaded] = useState(true);

    // Sync with other components/tabs
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === HIDDEN_KEY) {
                setHiddenEmployees(getHiddenSet());
            }
        };

        const handleCustom = () => {
            setHiddenEmployees(getHiddenSet());
        };

        window.addEventListener("storage", handleStorage);
        window.addEventListener(EVENT_KEY, handleCustom);

        return () => {
            window.removeEventListener("storage", handleStorage);
            window.removeEventListener(EVENT_KEY, handleCustom);
        };
    }, []);

    const persist = useCallback((next: Set<string>) => {
        try {
            localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next)));
            window.dispatchEvent(new Event(EVENT_KEY));
        } catch (e) {
            console.warn("hiddenEmployees save failed", e);
        }
    }, []);

    const hideEmployee = useCallback((name: string) => {
        const current = getHiddenSet();
        current.add(name);
        persist(current);
    }, [persist]);

    const unhideEmployee = useCallback((name: string) => {
        const current = getHiddenSet();
        current.delete(name);
        persist(current);
    }, [persist]);

    const unhideAll = useCallback(() => {
        const next = new Set<string>();
        persist(next);
    }, [persist]);

    const isHidden = useCallback((name: string) => hiddenEmployees.has(name), [hiddenEmployees]);

    return {
        hiddenEmployees,
        hideEmployee,
        unhideEmployee,
        unhideAll,
        isHidden,
        isLoaded
    };
}
