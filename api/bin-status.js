export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rvmId = req.query.id || req.query.rvmId;
  if (!rvmId) {
    return res.status(400).json({ status: 'error', message: 'Missing rvmId query parameter' });
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

    const binRes = await fetch(`https://bts.bcrs.sg/ab0capi/v10/${uuid}/locations/rvms/${rvmId}/bin-status`, {
      headers: { ...HEADERS, 'x-bcrs-map-token': token }
    }).then(r => r.json());

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json(binRes);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}
