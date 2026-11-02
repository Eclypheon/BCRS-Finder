let cachedOnemapToken = null;

async function getOnemapToken(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && cachedOnemapToken && now < cachedOnemapToken.expiresAt) {
    return cachedOnemapToken.token;
  }

  const email = process.env.ONEMAP_EMAIL;
  const password = process.env.ONEMAP_PASSWORD;
  if (!email || !password) {
    if (process.env.ONEMAP_TOKEN) return process.env.ONEMAP_TOKEN;
    throw new Error('OneMap credentials not configured in environment variables');
  }

  const res = await fetch('https://www.onemap.gov.sg/api/auth/post/getToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`OneMap token request failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  const token = data?.access_token;
  if (!token) throw new Error('No access_token returned by OneMap');

  cachedOnemapToken = {
    token,
    expiresAt: now + 70 * 60 * 60 * 1000,
  };
  return token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { start, end, routeType = 'walk' } = req.query;
  if (!start || !end) {
    return res.status(400).json({ status: 'error', message: 'Missing start or end coordinates' });
  }

  try {
    let token = await getOnemapToken();
    const callApi = async (tok) => {
      const url = `https://www.onemap.gov.sg/api/public/routingsvc/route?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&routeType=${encodeURIComponent(routeType)}`;
      return await fetch(url, {
        headers: { Accept: 'application/json', Authorization: tok }
      });
    };

    let apiRes = await callApi(token);
    if (apiRes.status === 401 || apiRes.status === 403) {
      cachedOnemapToken = null;
      token = await getOnemapToken(true);
      apiRes = await callApi(token);
    }

    if (!apiRes.ok) {
      return res.status(apiRes.status).send(await apiRes.text());
    }

    const data = await apiRes.json();
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}
