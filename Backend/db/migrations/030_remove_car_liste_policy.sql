-- Migration 030: Remove deprecated car_liste page key from group policies and user overrides

UPDATE groups
SET policy = policy - 'car_liste'
WHERE policy ? 'car_liste';

UPDATE users
SET access_override = access_override - 'car_liste'
WHERE access_override ? 'car_liste';