import { api, asArray } from "./api";

export interface EmployeeConstraints {
    no_night?: boolean;
    max_weekends?: number;
    only_early?: boolean;
}

export interface ConstraintViolation {
    id: number;
    employee_name: string;
    date?: string;
    month: string;
    constraint_key: string;
    details: { msg: string };
    created_at: string;
}

export async function fetchConstraints(): Promise<Record<string, EmployeeConstraints>> {
    const res = await api.get("/constraints");
    // Convert array to map: { "Müller": { ... } }
    const out: Record<string, EmployeeConstraints> = {};
    const list = Array.isArray(res.data) ? res.data : [];
    list.forEach((row: any) => {
        out[row.employee_name] = row.constraints;
    });
    return out;
}

export async function saveConstraints(employee_name: string, constraints: EmployeeConstraints): Promise<void> {
    await api.post("/constraints", { employee_name, constraints });
}

export async function fetchViolations(month: string): Promise<ConstraintViolation[]> {
    const res = await api.get(`/constraints/violations?month=${month}`);
    return asArray(res.data, "fetchConstraintViolations");
}
