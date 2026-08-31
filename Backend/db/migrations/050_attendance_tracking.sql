-- 050: Attendance Tracking (Kommen/Gehen)
-- Tracks actual arrival/departure times per employee per day

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    employee_name VARCHAR(200) NOT NULL,
    date DATE NOT NULL,
    arrival_time TIME DEFAULT NULL,
    departure_time TIME DEFAULT NULL,
    note VARCHAR(500) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(200) DEFAULT NULL,
    CONSTRAINT uk_attendance_employee_date UNIQUE (employee_name, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance (date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance (employee_name);
