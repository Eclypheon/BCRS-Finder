export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'x-bcrs-client': 'web',
    'Referer': 'https://bts.bcrs.sg/14f3d8bb-83ae-63a28c5b8631/public-rvm-map',
    'Accept': 'application/json'
  };

  try {
    const tokenRes = await fetch('https://bts.bcrs.sg/ab0capi/v10/map-token', { headers: HEADERS }).then(r => r.json());
    const uuid = tokenRes?.data?.uuid;
    if (!uuid) throw new Error('UUID failed');

    const accRes = await fetch(`https://bts.bcrs.sg/ab0capi/v10/${uuid}/locations/access-token`, { headers: HEADERS }).then(r => r.json());
    const token = accRes?.data?.token;
    if (!token) throw new Error('Token failed');

    const locRes = await fetch(`https://bts.bcrs.sg/ab0capi/v10/${uuid}/locations`, {
      headers: { ...HEADERS, 'x-bcrs-map-token': token }
    }).then(r => r.json());

    const raw = locRes?.data || [];
    const fetchTimestamp = new Date().toISOString();
    const cleaned = [];

    for (const item of raw) {
      const lat = parseFloat(item.latitude);
      const lng = parseFloat(item.longitude);
      if (isNaN(lat) || isNaN(lng) || lat < 1.15 || lat > 1.49 || lng < 103.55 || lng > 104.1) continue;

      let locationName = (item.locationName || '').trim();
      const address = (item.address || '').trim();
      if (!locationName && address) locationName = address.split(',')[0];
      if (!locationName) locationName = `BCRS RVM #${item.id}`;

      const rawStatus = (item.status || 'UNKNOWN').trim().toUpperCase();
      let status = 'RUNNING';
      if (['FULL'].includes(rawStatus)) status = 'FULL';
      else if (['OFFLINE', 'CLEANING', 'SUSPENDED', 'MAINTENANCE', 'ERROR', 'UNKNOWN'].includes(rawStatus)) status = rawStatus;

      cleaned.push({
        id: item.id,
        serialNumber: item.serialNumber || '',
        locationName,
        address,
        postalCode: (item.postalCode || '').trim(),
        latitude: lat,
        longitude: lng,
        status,
        rawStatus,
        coordsColor: item.coords_color || 'Blue',
        openingHours: item.rvmOpeningHours || 'Mon - Sun: 24 Hrs',
        remarks: item.rvm_remarks || '',
        ...(item.updated_at || item.updatedAt ? { updated_at: item.updated_at || item.updatedAt } : {})
      });
    }

    const forceRefresh = req.query.refresh === 'true';
    res.setHeader('Cache-Control', forceRefresh ? 'no-cache, no-store' : 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({
      status: 'ok',
      count: cleaned.length,
      synced_at: fetchTimestamp,
      data: cleaned
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}
