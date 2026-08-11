// scratch/dedupe-direct.js
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

async function run() {
  try {
    const configPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const token = config.tokens.access_token;

    console.log('Access token loaded directly from config:', token.substring(0, 15) + '...');

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
