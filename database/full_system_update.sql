-- ======================================================================
-- 🚨 FULL SYSTEM UPDATE SCRIPT
-- ======================================================================
-- Run this script in the Supabase SQL Editor to apply ALL recent fixes and features.
-- Includes:
-- 1. Profiles & RLS Fixes
-- 2. Clinics Constraints
-- 3. Hospitals System
-- 4. Hospital Beds System
-- 5. Critical Cases & Patient Updates
-- ======================================================================

-- ======================================================================
-- SECTION 1: PROFILES & RLS FIX (fix_profiles_rls.sql)
-- ======================================================================

-- 1. Ensure profiles table exists
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add Role Check Constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('user', 'admin', 'clinic_doctor', 'transport_provider', 'hospital_admin', 'driver', 'transport_pilot'));

-- 3. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Re-create Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles; 

-- Policy: View Own Profile
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- Policy: Update Own Profile
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Policy: Insert Own Profile
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ======================================================================
-- SECTION 2: CLINICS CONSTRAINTS (fix_clinics_constraint.sql)
-- ======================================================================
-- 1. Add Unique Constraint to 'admin_id'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_admin_id_key') THEN
        ALTER TABLE public.clinics ADD CONSTRAINT clinics_admin_id_key UNIQUE (admin_id);
    END IF;
END $$;

-- 2. Add Unique Constraint to 'name'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_name_key') THEN
        ALTER TABLE public.clinics ADD CONSTRAINT clinics_name_key UNIQUE (name);
    END IF;
END $$;

-- ======================================================================
-- SECTION 3: HOSPITALS SCHEMA (hospitals_schema.sql)
-- ======================================================================

-- 1. Create Hospitals Table
CREATE TABLE IF NOT EXISTS public.hospitals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    city TEXT,
    address TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    facility_type TEXT DEFAULT 'multi_specialty',
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    admin_email TEXT,
    status TEXT DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'active', 'suspended')),
    total_beds INTEGER DEFAULT 0,
    specialities TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add indexes
CREATE INDEX IF NOT EXISTS idx_hospitals_region ON public.hospitals(region);
CREATE INDEX IF NOT EXISTS idx_hospitals_status ON public.hospitals(status);
CREATE INDEX IF NOT EXISTS idx_hospitals_admin ON public.hospitals(admin_id);

-- 3. Enable RLS
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Anyone can view active hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "Hospital admins can update own hospital" ON public.hospitals;
DROP POLICY IF EXISTS "Anyone can register a hospital" ON public.hospitals;
DROP POLICY IF EXISTS "Admins can manage all hospitals" ON public.hospitals;

-- All authenticated users can view active hospitals
CREATE POLICY "Anyone can view active hospitals"
    ON public.hospitals FOR SELECT
    USING (status = 'active' OR admin_id = auth.uid());

-- Hospital admins can update their own hospital
CREATE POLICY "Hospital admins can update own hospital"
    ON public.hospitals FOR UPDATE
    USING (admin_id = auth.uid());

-- Anyone can insert (registration)
CREATE POLICY "Anyone can register a hospital"
    ON public.hospitals FOR INSERT
    WITH CHECK (true);

-- Admins can manage all hospitals
CREATE POLICY "Admins can manage all hospitals"
    ON public.hospitals FOR ALL
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- 5. Update evacuations table
ALTER TABLE public.evacuations ADD COLUMN IF NOT EXISTS target_hospital_id UUID REFERENCES public.hospitals(id);

-- 6. Create region mappings
CREATE TABLE IF NOT EXISTS public.region_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    origin_region TEXT NOT NULL UNIQUE,
    target_region TEXT NOT NULL
);

-- 7. Seed region mappings
INSERT INTO public.region_mappings (origin_region, target_region) VALUES
    ('Andaman', 'Chennai'),
    ('Nicobar', 'Chennai'),
    ('Lakshadweep', 'Kerala'),
    ('Ooty', 'Coimbatore'),
    ('Kodaikanal', 'Coimbatore')
ON CONFLICT (origin_region) DO NOTHING;

-- ======================================================================
-- SECTION 4: HOSPITAL BEDS SYSTEM (phase2_hospital_beds.sql)
-- ======================================================================

-- 1. Create Hospital Beds Table
CREATE TABLE IF NOT EXISTS public.hospital_beds (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE CASCADE,
    bed_number INTEGER NOT NULL,
    ward TEXT DEFAULT 'General',
    is_occupied BOOLEAN DEFAULT false,
    occupied_since TIMESTAMP WITH TIME ZONE,
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(hospital_id, bed_number)
);

-- 2. Enable Realtime
alter publication supabase_realtime add table public.hospital_beds;

-- 3. Function to Seed Beds
CREATE OR REPLACE FUNCTION public.seed_hospital_beds()
RETURNS TRIGGER AS $$
DECLARE
    i INTEGER;
    current_beds INTEGER;
BEGIN
    IF NEW.total_beds > 0 THEN
        SELECT COUNT(*) INTO current_beds FROM public.hospital_beds WHERE hospital_id = NEW.id;
        IF current_beds < NEW.total_beds THEN
            FOR i IN (current_beds + 1)..NEW.total_beds LOOP
                INSERT INTO public.hospital_beds (hospital_id, bed_number)
                VALUES (NEW.id, i);
            END LOOP;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger for Bed Seeding
DROP TRIGGER IF EXISTS on_hospital_bed_update ON public.hospitals;
CREATE TRIGGER on_hospital_bed_update
AFTER INSERT OR UPDATE OF total_beds ON public.hospitals
FOR EACH ROW EXECUTE FUNCTION public.seed_hospital_beds();

-- ======================================================================
-- SECTION 5: CRITICAL CASES (complete_critical_setup.sql)
-- ======================================================================

-- 1. CRITICAL_CASES TABLE
CREATE TABLE IF NOT EXISTS public.critical_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    target_hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'shared' CHECK (status IN ('shared', 'acknowledged', 'transferred', 'closed')),
    notes TEXT,
    shared_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_critical_cases_hospital ON public.critical_cases(target_hospital_id, status);
CREATE INDEX IF NOT EXISTS idx_critical_cases_clinic ON public.critical_cases(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_critical_cases_patient ON public.critical_cases(patient_id);

-- RLS
ALTER TABLE public.critical_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for critical_cases" ON public.critical_cases;
CREATE POLICY "Allow all for critical_cases" ON public.critical_cases FOR ALL USING (true);

-- 2. PATIENTS TABLE UPDATES
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_patients_is_critical ON public.patients(clinic_id, is_critical) WHERE is_critical = TRUE;

-- 3. VITALS_LOGS TABLE UPDATES
ALTER TABLE public.vitals_logs ADD COLUMN IF NOT EXISTS is_session_closed BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_vitals_session_closed ON public.vitals_logs(patient_id, is_session_closed);

-- ======================================================================
-- FINAL: FORCE SCHEMA RELOAD
-- ======================================================================
NOTIFY pgrst, 'reload schema';

SELECT '✅ Full System Update Completed Successfully! All schemas are now active.' AS status;
