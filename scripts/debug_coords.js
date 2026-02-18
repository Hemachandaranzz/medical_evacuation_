
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../backend/.env') })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkCoordinates() {
    console.log('--- CHECKING CLINICS ---')
    const { data: clinics, error: clinicsError } = await supabase
        .from('clinics')
        .select('id, name, latitude, longitude')
        .limit(10)

    if (clinicsError) console.error('Error fetching clinics:', clinicsError)
    else console.table(clinics)

    console.log('\n--- CHECKING HOSPITALS ---')
    const { data: hospitals, error: hospitalsError } = await supabase
        .from('hospitals')
        .select('id, name, latitude, longitude')
        .limit(10)

    if (hospitalsError) console.error('Error fetching hospitals:', hospitalsError)
    else console.table(hospitals)

    console.log('\n--- CHECKING ACTIVE BOOKINGS ---')
    // Get last 5 bookings
    const { data: bookings, error: bookingsError } = await supabase
        .from('transport_bookings')
        .select('id, pickup_location, destination_location, pickup_latitude, pickup_longitude, destination_latitude, destination_longitude, clinic_id')
        .order('created_at', { ascending: false })
        .limit(5)

    if (bookingsError) console.error('Error fetching bookings:', bookingsError)
    else console.table(bookings)
}

checkCoordinates()
