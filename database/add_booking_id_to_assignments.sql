-- Add transport_booking_id to transport_assignments to strictly link assignments to bookings
ALTER TABLE public.transport_assignments
ADD COLUMN IF NOT EXISTS transport_booking_id UUID REFERENCES public.transport_bookings(id);

COMMENT ON COLUMN public.transport_assignments.transport_booking_id IS 'Direct link to the transport_booking this assignment is fulfilling.';
