
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

async function testQuery() {
    console.log('Testing /api/bookings/clinic query parts...');

    // 1. Test basic bookings fetch
    console.log('\n1. Fetching basic bookings (limit 1)...');
    const { data: basic, error: basicError } = await supabase
        .from('transport_bookings')
        .select('*')
        .limit(1);

    if (basicError) console.error('Basic fetch failed:', basicError);
    else {
        console.log('Basic fetch success. Count:', basic.length);
        if (basic.length > 0) {
            console.log('Booking columns:', Object.keys(basic[0]));
        }
    }

    // 2. Test assignments basic fetch
    console.log('\n2. Fetching transport_assignments (limit 1)...');
    const { data: assign, error: assignError } = await supabase
        .from('transport_assignments')
        .select('*')
        .limit(1);

    if (assignError) {
        console.error('Assignments fetch failed:', assignError);
        console.log('NOTE: If this fails, the table might not exist or be named differently.');
    }
    else {
        console.log('Assignments fetch success. Count:', assign.length);
        if (assign.length > 0) {
            console.log('Assignment columns:', Object.keys(assign[0]));
        }
    }

    // 3. Test Join Bookings -> Assignments
    console.log('\n3. Testing Join Bookings -> Assignments...');
    const { data: joinAssign, error: joinAssignError } = await supabase
        .from('transport_bookings')
        .select('*, assignments:transport_assignments(*)')
        .limit(1);

    if (joinAssignError) console.error('Join Bookings->Assignments failed:', joinAssignError);
    else console.log('Join Bookings->Assignments success.');

    // 4. Test Join Assignments -> Drivers
    console.log('\n4. Testing Join Assignments -> Drivers...');
    if (assign && assign.length > 0) {
        // Try on the assignments table directly
        const { data: driverJoin, error: driverJoinError } = await supabase
            .from('transport_assignments')
            .select('*, driver:drivers(*)')
            .limit(1);

        if (driverJoinError) console.error('Join Assignments->Drivers failed:', driverJoinError);
        else console.log('Join Assignments->Drivers success.');
    } else {
        console.log('Skipping step 4 (no assignments found).');
    }

    // 5. Test Full Query from Route
    console.log('\n5. Testing Full Route Query...');
    const { data: full, error: fullError } = await supabase
        .from('transport_bookings')
        .select(`
            *,
            patient:patients(id, name, patient_id),
            company:transport_companies(id, company_name),
            vehicle:vehicles(id, vehicle_name, vehicle_type),
            assignments:transport_assignments(current_status, driver_id, driver:drivers(full_name))
        `)
        .limit(1);

    if (fullError) console.error('Full Query failed:', fullError);
    else console.log('Full Query success.');
}

testQuery();
