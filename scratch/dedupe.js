// scratch/dedupe.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// Helper to make HTTPS requests
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// Refresh OAuth access token using application/x-www-form-urlencoded
async function getAccessToken() {
  const configPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const refreshToken = config.tokens.refresh_token;

  console.log('Refreshing OAuth access token via URL-encoded form...');
  
  const params = new URLSearchParams();
  // Firebase CLI credentials
  params.append('client_id', '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com');
  params.append('client_secret', 'LswytAdY38gf3mJs22m6i456');
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);

  const body = params.toString();

  const res = await request({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);

  if (res.status !== 200) {
    throw new Error('Failed to refresh token: ' + JSON.stringify(res.body));
  }
  return res.body.access_token;
}

async function run() {
  try {
    const token = await getAccessToken();
    console.log('Access token retrieved successfully.');

    // We want to query all checklist_items for the active month "2026-07"
    const today = new Date();
    const activeMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    console.log(`Querying checklist_items for month: ${activeMonth}`);

    const res = await request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/spendnot-app/databases/(default)/documents:runQuery`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, {
      structuredQuery: {
        from: [{ collectionId: 'checklist_items' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'month' },
            op: 'EQUAL',
            value: { stringValue: activeMonth }
          }
        }
      }
    });

    if (res.status !== 200) {
      console.error('Query failed:', res.body);
      return;
    }

    const docs = res.body
      .filter(d => d.document)
      .map(d => {
        const doc = d.document;
        const namePath = doc.name;
        const id = namePath.split('/').pop();
        const fields = doc.fields;
        return {
          id,
          name: fields.name?.stringValue || '',
          amount: parseFloat(fields.amount?.doubleValue || fields.amount?.integerValue || '0'),
          isPaid: fields.isPaid?.booleanValue || false,
          category: fields.category?.stringValue || '',
          uid: fields.uid?.stringValue || ''
        };
      });

    console.log(`\nFound ${docs.length} checklist items for ${activeMonth}.`);
    
    // Group by name
    const grouped = {};
    docs.forEach(d => {
      const key = d.name.toLowerCase().trim();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(d);
    });

    console.log('\n--- Duplicate Groups ---');
    let hasDuplicates = false;
    Object.keys(grouped).forEach(name => {
      const list = grouped[name];
      if (list.length > 1) {
        hasDuplicates = true;
        console.log(`"${name}": count=${list.length}`);
        list.forEach(item => {
          console.log(`  - [ID: ${item.id}] paid=${item.isPaid}, amount=₹${item.amount}`);
        });
      }
    });

    if (!hasDuplicates) {
      console.log('No duplicates found!');
      return;
    }

    console.log('\nDeduplicating (keeping only the first item in each group, preferring paid)...');
    let deletedCount = 0;
    for (const name of Object.keys(grouped)) {
      const list = grouped[name];
      if (list.length > 1) {
        // Sort: paid items first
        list.sort((a, b) => (b.isPaid ? 1 : 0) - (a.isPaid ? 1 : 0));
        const toKeep = list[0];
        const toDelete = list.slice(1);

        console.log(`For "${name}", keeping ${toKeep.id} (paid=${toKeep.isPaid}). Deleting ${toDelete.length} duplicates...`);

        for (const item of toDelete) {
          const deleteRes = await request({
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/spendnot-app/databases/(default)/documents/checklist_items/${item.id}`,
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (deleteRes.status === 200 || deleteRes.status === 204) {
            deletedCount++;
          } else {
            console.error(`Failed to delete document ${item.id}:`, deleteRes.body);
          }
        }
      }
    }
    console.log(`Deduplication finished! Deleted ${deletedCount} duplicate documents.`);

  } catch (e) {
    console.error('Error running dedupe script:', e);
  }
}

run();
