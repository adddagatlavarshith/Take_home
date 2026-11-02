-- Enable btree_gist extension required for the exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping availability slots for the same doctor.
-- The '[)' range is half-open: start inclusive, end exclusive.
-- Slots with status 'blocked' are excluded from the constraint (e.g. admin blackouts).
ALTER TABLE availability_slots
  ADD CONSTRAINT no_overlapping_doctor_slots
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status <> 'blocked');
