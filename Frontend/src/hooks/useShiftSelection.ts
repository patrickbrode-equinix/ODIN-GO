import { useState, useCallback } from 'react';

type SelectionState = {
    employeeName: string | null;
    selectedDays: Set<number>;
    anchorDay: number | null; // The day where the selection started (for Shift+Click ranges)
};

export function useShiftSelection() {
    const [selection, setSelection] = useState<SelectionState>({
        employeeName: null,
        selectedDays: new Set(),
        anchorDay: null,
    });

    const selectCell = useCallback((employeeName: string, day: number, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
        setSelection((prev) => {
            const isSameEmployee = prev.employeeName === employeeName;
            const isCtrl = modifiers.ctrlKey || modifiers.metaKey;
            const isShift = modifiers.shiftKey;

            // 1. Different Employee Clicked -> Reset and start fresh (unless just Ctrl, but strict rule says "ONLY FOR ONE EMPLOYEE AT A TIME")
            // Even with Ctrl, if I click another employee, I should probably switch focus to that employee to prevent cross-employee selection.
            if (!isSameEmployee) {
                return {
                    employeeName,
                    selectedDays: new Set([day]),
                    anchorDay: day,
                };
            }

            // 2. Same Employee logic

            // SHIFT + Click: Range Selection
            if (isShift && prev.anchorDay !== null) {
                const start = Math.min(prev.anchorDay, day);
                const end = Math.max(prev.anchorDay, day);

                const rangeSet = new Set<number>();
                for (let i = start; i <= end; i++) {
                    rangeSet.add(i);
                }

                return {
                    ...prev,
                    selectedDays: rangeSet,
                    // anchorDay keeps pointing to the original start
                };
            }

            // CTRL + Click: Toggle
            if (isCtrl) {
                const newSet = new Set(prev.selectedDays);
                if (newSet.has(day)) {
                    newSet.delete(day);
                } else {
                    newSet.add(day);
                }

                // If we toggled off the last one, we might want to reset? 
                // But keeping employeeName is fine until we select someone else.
                // Reset anchor to this clicked day for subsequent Shift actions?
                // Standard behavior: clicking sets anchor.
                return {
                    ...prev,
                    selectedDays: newSet,
                    anchorDay: day,
                };
            }

            // Normal Click: Single Select (clears others)
            return {
                employeeName,
                selectedDays: new Set([day]),
                anchorDay: day,
            };
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelection({
            employeeName: null,
            selectedDays: new Set(),
            anchorDay: null,
        });
    }, []);

    const isSelected = useCallback((employeeName: string, day: number) => {
        return selection.employeeName === employeeName && selection.selectedDays.has(day);
    }, [selection]);

    // Helper to get all selected cell keys (for batch operations)
    // Returns Set<string> of "employeeName|||day"
    const getSelectedKeys = useCallback(() => {
        const keys = new Set<string>();
        if (!selection.employeeName) return keys;

        for (const day of selection.selectedDays) {
            keys.add(`${selection.employeeName}|||${day}`);
        }
        return keys;
    }, [selection]);

    return {
        selection,
        selectCell,
        clearSelection,
        isSelected,
        getSelectedKeys
    };
}
