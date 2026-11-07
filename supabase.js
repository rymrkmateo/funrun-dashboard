require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const TABLE = 'participants';
const EVENT_TABLE = 'event_settings';

const SEED = [
  { full_name: 'Maria Santos', email: 'maria.santos@example.com', contact: '09171234567', age: 21, gender: 'Female', category: '5K', shirt_size: 'M', status: 'Confirmed' },
  { full_name: 'Juan Dela Cruz', email: 'juan.delacruz@example.com', contact: '09181234568', age: 24, gender: 'Male', category: '10K', shirt_size: 'L', status: 'Confirmed' },
  { full_name: 'Angela Reyes', email: 'angela.reyes@example.com', contact: '09191234569', age: 19, gender: 'Female', category: '3K', shirt_size: 'S', status: 'Pending' },
  { full_name: 'Paolo Garcia', email: 'paolo.garcia@example.com', contact: '09201234570', age: 27, gender: 'Male', category: '5K', shirt_size: 'XL', status: 'Pending' },
  { full_name: 'Kristine Lim', email: 'kristine.lim@example.com', contact: '09211234571', age: 22, gender: 'Female', category: '10K', shirt_size: 'S', status: 'Confirmed' },
  { full_name: 'Mark Villanueva', email: 'mark.villanueva@example.com', contact: '09221234572', age: 31, gender: 'Male', category: '3K', shirt_size: 'L', status: 'Cancelled' },
  { full_name: 'Bea Fernandez', email: 'bea.fernandez@example.com', contact: '09231234573', age: 20, gender: 'Female', category: '5K', shirt_size: 'M', status: 'Pending' },
  { full_name: 'Carlo Mendoza', email: 'carlo.mendoza@example.com', contact: '09241234574', age: 28, gender: 'Male', category: '10K', shirt_size: 'M', status: 'Confirmed' },
];

let client;

async function init() {
  const { SUPABASE_URL, SUPABASE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY are missing. Add them to your .env file.');
  }

  let url;
  try {
    url = new URL(SUPABASE_URL.trim()).origin;
  } catch {
    throw new Error('SUPABASE_URL is not a valid URL. Use the form https://your-project-ref.supabase.co');
  }

  client = createClient(url, SUPABASE_KEY.trim(), { auth: { persistSession: false } });

  const { count, error } = await client.from(TABLE).select('*', { count: 'exact', head: true });
  if (error) throw new Error(error.message || 'Could not read the participants table.');

  if (count === 0) {
    const { error: seedError } = await client.from(TABLE).insert(SEED);
    if (seedError) throw new Error(seedError.message);
    console.log('Seeded sample participants.');
  }
}

const getClient = () => client;

module.exports = { init, getClient, TABLE, EVENT_TABLE };
