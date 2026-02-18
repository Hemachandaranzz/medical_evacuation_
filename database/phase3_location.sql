-- ======================================================================
-- 🗺️ PHASE 3: LOCATION-AWARE TRANSPORT
-- ======================================================================
-- Additive migration only — no existing columns or tables are modified.
-- Run this in the Supabase SQL Editor after full_system_update.sql.
-- ======================================================================

-- ======================================================================
-- SECTION 1: EXTEND CLINICS TABLE
-- ======================================================================

ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7);
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7);
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- ======================================================================
-- SECTION 2: EXTEND HOSPITALS TABLE
-- ======================================================================

ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7);
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7);
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- ======================================================================
-- SECTION 3: CREATE DRIVER_LOCATIONS TABLE
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.driver_locations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id UUID NOT NULL REFERENCES public.transport_assignments(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    heading DECIMAL(5, 2),
    speed_kmh DECIMAL(6, 2),
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(booking_id, driver_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_driver_locations_booking ON public.driver_locations(booking_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver ON public.driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_recorded ON public.driver_locations(recorded_at);

-- Enable Realtime
ALTER publication supabase_realtime ADD TABLE public.driver_locations;

-- ======================================================================
-- SECTION 4: ROW LEVEL SECURITY
-- ======================================================================

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Drivers can INSERT/UPDATE their own location rows
DROP POLICY IF EXISTS "Drivers can insert own location" ON public.driver_locations;
CREATE POLICY "Drivers can insert own location"
    ON public.driver_locations FOR INSERT
    WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "Drivers can update own location" ON public.driver_locations;
CREATE POLICY "Drivers can update own location"
    ON public.driver_locations FOR UPDATE
    USING (driver_id = auth.uid());

-- Authenticated users can view driver locations for bookings they are involved in
-- (Simplified: allow all authenticated users to SELECT for MVP, tighten later)
DROP POLICY IF EXISTS "Authenticated users can view driver locations" ON public.driver_locations;
CREATE POLICY "Authenticated users can view driver locations"
    ON public.driver_locations FOR SELECT
    USING (auth.role() = 'authenticated');

-- Admins can view all driver locations
DROP POLICY IF EXISTS "Admins can manage all driver locations" ON public.driver_locations;
CREATE POLICY "Admins can manage all driver locations"
    ON public.driver_locations FOR ALL
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ======================================================================
-- FINAL: FORCE SCHEMA RELOAD
-- ======================================================================
NOTIFY pgrst, 'reload schema';

SELECT '✅ Phase 3 Location Migration Completed!' AS status;
