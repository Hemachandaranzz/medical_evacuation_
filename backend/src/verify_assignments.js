
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyAssignments() {
    console.log('--- Verifying Assignments Logic ---');

    // 1. Fetch all active bookings (status != completed/cancelled)
    const { data: bookings, error: bookingsError } = await supabase
        .from('transport_bookings')
        .select('id, driver_id, booking_status, pickup_location')
        .not('booking_status', 'in', '("completed","cancelled")')
        .not('driver_id', 'is', null);

    if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError);
        return;
    }

    console.log(`Found ${bookings.length} active bookings with drivers.`);

    if (bookings.length === 0) {
        console.log("No active bookings with drivers found. Exiting.");
        return;
    }

    const driverIds = bookings.map(b => b.driver_id);
    console.log('Driver IDs:', driverIds);

    // 2. Query assignments for these drivers
    const { data: assignments, error: assignmentsError } = await supabase
        .from('transport_assignments')
        .select('id, driver_id, current_status, request_id')
        .in('driver_id', driverIds)
        .not('current_status', 'in', '("completed","cancelled","declined")');

    if (assignmentsError) {
        console.error('Error fetching assignments:', assignmentsError);
        return;
    }

    console.log(`Found ${assignments.length} active assignments for these drivers.`);
    console.log('Assignments:', assignments);

    // 3. Match them up
    bookings.forEach(booking => {
        const match = assignments.find(a => a.driver_id === booking.driver_id);
        if (match) {
            console.log(`[MATCH] Booking ${booking.id} (Status: ${booking.booking_status}) -> Assignment ${match.id} (Status: ${match.current_status})`);
        } else {
            console.log(`[NO MATCH] Booking ${booking.id} (Status: ${booking.booking_status}) has driver ${booking.driver_id} but NO active assignment.`);
        }
    });
}

verifyAssignments();
