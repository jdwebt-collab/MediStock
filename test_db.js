const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data: meds } = await admin.from('medicines').select('patient_id, name');
  console.log('All medicines:', meds);

  const { data: profiles } = await admin.from('profiles').select('id, full_name, role');
  console.log('Profiles:', profiles);

  const { data: rels } = await admin.from('care_relationships').select('*');
  console.log('Relationships:', rels);
}
test();
