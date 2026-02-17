-- 1. Modify Hospitals Table
ALTER TABLE public.hospitals 
ADD COLUMN IF NOT EXISTS total_beds INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS specialities TEXT[] DEFAULT '{}';

-- 2. Create Hospital Beds Table
CREATE TABLE IF NOT EXISTS public.hospital_beds (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE CASCADE,
    bed_number INTEGER NOT NULL,
    ward TEXT DEFAULT 'General',
    is_occupied BOOLEAN DEFAULT false,
    occupied_since TIMESTAMP WITH TIME ZONE,
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(hospital_id, bed_number)
);

-- 3. Enable Realtime for beds
alter publication supabase_realtime add table public.hospital_beds;

-- 4. Function to Seed Beds automatically
CREATE OR REPLACE FUNCTION public.seed_hospital_beds()
RETURNS TRIGGER AS $$
DECLARE
    i INTEGER;
    current_beds INTEGER;
    new_beds_count INTEGER;
BEGIN
    -- Only proceed if total_beds is greater than 0
    IF NEW.total_beds > 0 THEN
        -- Check how many beds already exist
        SELECT COUNT(*) INTO current_beds FROM public.hospital_beds WHERE hospital_id = NEW.id;
        
        -- If we have fewer beds than the new total, add the difference
        IF current_beds < NEW.total_beds THEN
            FOR i IN (current_beds + 1)..NEW.total_beds LOOP
                INSERT INTO public.hospital_beds (hospital_id, bed_number)
                VALUES (NEW.id, i);
            END LOOP;
        END IF;
        
        -- Optional: If we have MORE beds than the new total (reduction), we might want to disable or delete them.
        -- For now, we will strictly ADD beds to avoid data loss on accidental reduction.
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger to run the function on Hospital update/insert
DROP TRIGGER IF EXISTS on_hospital_bed_update ON public.hospitals;

CREATE TRIGGER on_hospital_bed_update
AFTER INSERT OR UPDATE OF total_beds ON public.hospitals
FOR EACH ROW
EXECUTE FUNCTION public.seed_hospital_beds();
