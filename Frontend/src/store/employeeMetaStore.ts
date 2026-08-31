
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface EmployeeMeta {
    category?: string;
}

interface EmployeeMetaState {
    meta: Record<string, EmployeeMeta>;
    setCategory: (name: string, category: string) => void;
    getCategory: (name: string) => string | undefined;
}

export const useEmployeeMetaStore = create<EmployeeMetaState>()(
    persist(
        (set, get) => ({
            meta: {},
            setCategory: (name, category) =>
                set((state) => ({
                    meta: {
                        ...state.meta,
                        [name]: { ...state.meta[name], category },
                    },
                })),
            getCategory: (name) => get().meta[name]?.category,
        }),
        {
            name: "shiftcontrol.employeeMeta.v1",
        }
    )
);
