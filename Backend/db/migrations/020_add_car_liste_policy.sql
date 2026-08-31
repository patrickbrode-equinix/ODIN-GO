-- Migration 020: Add car_liste page key to existing group policies
-- This ensures existing groups get "view" access to the new Car Liste page.

UPDATE groups
SET policy = policy || '{"car_liste": "view"}'::jsonb
WHERE NOT (policy ? 'car_liste');
