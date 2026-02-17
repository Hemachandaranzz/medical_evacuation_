import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

console.log('--- SUPABASE CONFIG VERIFICATION ---');
console.log('URL:', supabaseUrl);
console.log('Key (Length):', supabaseKey ? supabaseKey.length : 'MISSING');
console.log('Key (First 10):', supabaseKey ? supabaseKey.slice(0, 10) : 'N/A');
console.log('Key (Last 10):', supabaseKey ? supabaseKey.slice(-10) : 'N/A');

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing configuration!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log('\n--- TESTING CONNECTION ---');
    // Try to list users (requires Service Role)
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });

    if (error) {
        console.error('❌ Service Role Verification FAILED:', error.message);
        if (error.message.includes('JWT')) {
            console.error('   -> Hint: The key provided might be invalid or not a Service Role key.');
        }
    } else {
        console.log('✅ Service Role Verification SUCCESS!');
        console.log('   -> Successfully fetched user list (Admin Privilege).');
    }
}

verify();
