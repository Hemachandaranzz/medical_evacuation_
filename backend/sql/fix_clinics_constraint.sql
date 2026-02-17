-- ======================================================================
-- 🏥 CLINIC REGISTRATION FIX
-- Run this script in Supabase SQL Editor to fix the "ON CONFLICT" error
-- ======================================================================

-- 1. Add Unique Constraint to 'admin_id'
-- This allows the system to check if a user already has a clinic
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'clinics_admin_id_key'
    ) THEN
        ALTER TABLE public.clinics ADD CONSTRAINT clinics_admin_id_key UNIQUE (admin_id);
    END IF;
END $$;

-- 2. Add Unique Constraint to 'name' (Best Practice)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'clinics_name_key'
    ) THEN
        ALTER TABLE public.clinics ADD CONSTRAINT clinics_name_key UNIQUE (name);
    END IF;
END $$;

-- 3. Verify
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.clinics'::regclass;
