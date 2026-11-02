/**
 * Cloudflare Worker: BCRS Real-Time Serverless Edge Proxy & OneMap Pedestrian Router
 * - Fetches live RVM data & bin telemetry directly from bts.bcrs.sg with CORS enabled.
 * - Proxies SLA OneMap pedestrian walking route API with automated 72-hour token renewal.
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'x-bcrs-client': 'web',
  'Referer': 'https://bts.bcrs.sg/14f3d8bb-83ae-63a28c5b8631/public-rvm-map',
  'Accept': 'application/json'
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

let cachedAuth = null;

// ======================== BCRS Auth Cache ========================
async function getAuth(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && cachedAuth && now < cachedAuth.expiresAt) {
    return cachedAuth;
  }

  // 1. Fetch map-token UUID
  const tokenRes = await fetch('https://bts.bcrs.sg/ab0capi/v10/map-token', { headers: HEADERS }).then(r => r.json());
  if (!tokenRes?.data?.uuid) {
    throw new Error('Failed to get map-token UUID: ' + JSON.stringify(tokenRes));
  }
  const uuid = tokenRes.data.uuid;

  // 2. Fetch access-token for this specific UUID
  const accRes = await fetch(`https://bts.bcrs.sg/ab0capi/v10/${uuid}/locations/access-token`, { headers: HEADERS }).then(r => r.json());
  if (!accRes?.data?.token) {
    throw new Error('Failed to get access-token: ' + JSON.stringify(accRes));
  }
  const token = accRes.data.token;

  // bts.bcrs.sg map-tokens have a 60s lifetime; cache for 45s safely
  cachedAuth = {
    uuid,
    token,
    expiresAt: now + 45 * 1000,
  };
  return cachedAuth;
}

async function fetchFromUpstream(pathBuilder, forceFresh = false) {
  let auth = await getAuth(forceFresh);
  try {
    const res = await fetch(`https://bts.bcrs.sg/ab0capi/v10/${auth.uuid}/${pathBuilder(auth.uuid)}`, {
      headers: { ...HEADERS, 'x-bcrs-map-token': auth.token },
    });
    const json = await res.json();
    if (json && json.status === 'ok') {
      return json;
    }
  } catch (_) {}

  // If failed, force a fresh auth pair and retry once
  cachedAuth = null;
  auth = await getAuth(true);
  const res = await fetch(`https://bts.bcrs.sg/ab0capi/v10/${auth.uuid}/${pathBuilder(auth.uuid)}`, {
    headers: { ...HEADERS, 'x-bcrs-map-token': auth.token },
  });
  return await res.json();
}

// ===================== OneMap Automated Token Cache =====================
let cachedOnemapToken = null;

async function getOnemapToken(env, forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && cachedOnemapToken && now < cachedOnemapToken.expiresAt) {
    return cachedOnemapToken.token;
  }

  // Check for static token override first (if user sets ONEMAP_STATIC_TOKEN)
  if (env?.ONEMAP_STATIC_TOKEN && !env?.ONEMAP_EMAIL) {
    return env.ONEMAP_STATIC_TOKEN;
  }

  const email = env?.ONEMAP_EMAIL;
  const password = env?.ONEMAP_PASSWORD;

  if (!email || !password) {
    if (env?.ONEMAP_TOKEN) return env.ONEMAP_TOKEN;
    throw new Error('OneMap credentials missing. Please set ONEMAP_EMAIL and ONEMAP_PASSWORD secrets in Cloudflare Worker.');
  }

  const res = await fetch('https://www.onemap.gov.sg/api/auth/post/getToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OneMap token request failed (HTTP ${res.status}): ${errText}`);
  }

  const data = await res.json();
  const token = data?.access_token;
  if (!token) {
    throw new Error(`No access_token returned by OneMap: ${JSON.stringify(data)}`);
  }

  // OneMap tokens are valid for 72 hours (3 days).
  // Cache for 70 hours (renew 2 hours safely ahead of expiry).
  cachedOnemapToken = {
    token,
    expiresAt: now + 70 * 60 * 60 * 1000,
  };

  return token;
}

async function fetchOnemapRoute(start, end, routeType = 'walk', env) {
  let token = await getOnemapToken(env);

  const callApi = async (tok) => {
    const url = `https://www.onemap.gov.sg/api/public/routingsvc/route?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&routeType=${encodeURIComponent(routeType)}`;
    return await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': tok,
      },
    });
  };

  let res = await callApi(token);

  // If token was rejected upstream (HTTP 401/403), invalidate cache and retry once
  if (res.status === 401 || res.status === 403) {
    cachedOnemapToken = null;
    token = await getOnemapToken(env, true);
    res = await callApi(token);
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OneMap Routing API error (HTTP ${res.status}): ${errBody}`);
  }

  return await res.json();
}

export default {
  async fetch(request, env = {}, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    try {
      // Route 0: OneMap Pedestrian Route Proxy (/api/route or /route)
      const isRouteRoute = pathname === '/api/route' || pathname === '/route';
      if (isRouteRoute) {
        const start = url.searchParams.get('start');
        const end = url.searchParams.get('end');
        const routeType = url.searchParams.get('routeType') || 'walk';

        if (!start || !end) {
          return new Response(JSON.stringify({
            status: 'error',
            message: 'Missing "start" or "end" query parameters. Format: start=lat,lng&end=lat,lng'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        const routeData = await fetchOnemapRoute(start, end, routeType, env);

        return new Response(JSON.stringify(routeData), {
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
            // Cache valid route geometries for 1 hour to reduce upstream OneMap quota consumption
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          }
        });
      }

      // Route 1: Specific RVM bin-status (/api/rvms/:id/bin-status or ?rvmId=:id or ?id=:id)
      const rvmIdMatch = pathname.match(/\/api\/rvms\/(\d+)\/bin-status/);
      const isBinStatusRoute = Boolean(rvmIdMatch || pathname.includes('bin-status') || url.searchParams.has('rvmId'));
      const rvmId = rvmIdMatch ? rvmIdMatch[1] : (url.searchParams.get('rvmId') || (pathname.includes('bin-status') ? url.searchParams.get('id') : null));

      if (rvmId) {
        const binRes = await fetchFromUpstream(() => `locations/rvms/${rvmId}/bin-status`, forceRefresh);

        return new Response(JSON.stringify(binRes), {
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
            'Cache-Control': forceRefresh ? 'no-cache, no-store' : 'public, max-age=15',
          }
        });
      }

      if (isBinStatusRoute) {
        return new Response(JSON.stringify({ status: 'error', message: 'Valid rvmId is required for bin-status' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // Route 2: All RVMs (/api/rvms, /rvms or root /)
      const locRes = await fetchFromUpstream(() => 'locations', forceRefresh);

      if (!Array.isArray(locRes?.data)) {
        throw new Error('Unexpected upstream locations response: ' + JSON.stringify(locRes));
      }

      const fetchTimestamp = new Date().toISOString();
      const cleaned = [];

      for (const item of locRes.data) {
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
          ...(item.updated_at || item.updatedAt || item.last_updated
            ? { updated_at: item.updated_at || item.updatedAt || item.last_updated }
            : {})
        });
      }

      return new Response(JSON.stringify({
        status: 'ok',
        count: cleaned.length,
        synced_at: fetchTimestamp,
        data: cleaned
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
          'Cache-Control': forceRefresh ? 'no-cache, no-store' : 'public, max-age=20, s-maxage=20',
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ status: 'error', message: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }
  }
};
