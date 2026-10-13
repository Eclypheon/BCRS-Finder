// Script to fetch current BCRS RVM locations directly from bts.bcrs.sg
// and format them cleanly for offline and instant startup.

const fs = require('fs');
const path = require('path');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'x-bcrs-client': 'web',
  'Referer': 'https://bts.bcrs.sg/14f3d8bb-83ae-63a28c5b8631/public-rvm-map',
  'Accept': 'application/json'
};

async function fetchSeed() {
  console.log('Fetching map-token...');
  const tokenRes = await fetch('https://bts.bcrs.sg/ab0capi/v10/map-token', { headers: HEADERS }).then(r => r.json());
  if (!tokenRes?.data?.uuid) {
    throw new Error('Failed to get map-token UUID: ' + JSON.stringify(tokenRes));
  }
  const uuid = tokenRes.data.uuid;
  console.log('UUID obtained:', uuid);

  console.log('Fetching access-token...');
  const accRes = await fetch(`https://bts.bcrs.sg/ab0capi/v10/${uuid}/locations/access-token`, { headers: HEADERS }).then(r => r.json());
  if (!accRes?.data?.token) {
    throw new Error('Failed to get access-token: ' + JSON.stringify(accRes));
  }
  const token = accRes.data.token;
  console.log('Token obtained:', token.substring(0, 20) + '...');

  console.log('Fetching locations list...');
  const locRes = await fetch(`https://bts.bcrs.sg/ab0capi/v10/${uuid}/locations`, {
    headers: { ...HEADERS, 'x-bcrs-map-token': token }
  }).then(r => r.json());

  if (!Array.isArray(locRes?.data)) {
    throw new Error('Unexpected locations response: ' + JSON.stringify(locRes));
  }

  const raw = locRes.data;
  console.log(`Received ${raw.length} raw records.`);

  // Filter and sanitize Singapore machines
  const cleaned = [];
  for (const item of raw) {
    const lat = parseFloat(item.latitude);
    const lng = parseFloat(item.longitude);
    if (isNaN(lat) || isNaN(lng) || lat < 1.15 || lat > 1.49 || lng < 103.55 || lng > 104.1) {
      continue;
    }

    const postal = (item.postalCode || '').trim();
    let locationName = (item.locationName || '').trim();
    const address = (item.address || '').trim();

    if (!locationName && address) {
      locationName = address.split(',')[0];
    }
    if (!locationName) {
      locationName = `BCRS RVM #${item.id}`;
    }

    const rawStatus = (item.status || 'UNKNOWN').trim().toUpperCase();
    let status = 'RUNNING';
    if (['FULL'].includes(rawStatus)) {
      status = 'FULL';
    } else if (['OFFLINE', 'CLEANING', 'SUSPENDED', 'MAINTENANCE', 'ERROR', 'UNKNOWN'].includes(rawStatus)) {
      status = rawStatus;
    } else {
      status = 'RUNNING';
    }

    cleaned.push({
      id: item.id,
      serialNumber: item.serialNumber || '',
      locationName,
      address,
      postalCode: postal,
      latitude: lat,
      longitude: lng,
      status,
      rawStatus,
      coordsColor: item.coords_color || 'Blue',
      openingHours: item.rvmOpeningHours || 'Mon - Sun: 24 Hrs',
      remarks: item.rvm_remarks || ''
    });
  }

  console.log(`Cleaned ${cleaned.length} Singapore RVMs.`);

  const dest1 = path.join(__dirname, '../src/data/seed-rvms.json');
  const dest2 = path.join(__dirname, '../public/data/seed-rvms.json');

  const jsonStr = JSON.stringify(cleaned, null, 2);
  fs.writeFileSync(dest1, jsonStr);
  fs.writeFileSync(dest2, jsonStr);
  console.log(`Successfully saved to ${dest1} and ${dest2}`);
}

fetchSeed().catch(err => {
  console.error('Seed fetch failed:', err);
  process.exit(1);
});
