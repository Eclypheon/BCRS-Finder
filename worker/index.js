/**
 * Cloudflare Worker: BCRS Real-Time Serverless Edge Proxy
 * Fetches live RVM data & bin telemetry directly from bts.bcrs.sg with CORS enabled.
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

let cachedUuid = null;
let cachedUuidExpiry = 0;
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getTokens() {
  const now = Date.now();
  if (!cachedUuid || now > cachedUuidExpiry) {
    const tokenRes = await fetch('https://bts.bcrs.sg/ab0capi/v10/map-token', { headers: HEADERS }).then(r => r.json());
    if (!tokenRes?.data?.uuid) throw new Error('Failed to get map-token UUID');
    cachedUuid = tokenRes.data.uuid;
    cachedUuidExpiry = now + 1000 * 60 * 30; // 30 mins
  }

  if (!cachedToken || now > cachedTokenExpiry) {
    const accRes = await fetch(`https://bts.bcrs.sg/ab0capi/v10/${cachedUuid}/locations/access-token`, { headers: HEADERS }).then(r => r.json());
    if (!accRes?.data?.token) throw new Error('Failed to get access-token');
    cachedToken = accRes.data.token;
    cachedTokenExpiry = now + 1000 * 60 * 10; // 10 mins
  }

  return { uuid: cachedUuid, token: cachedToken };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    try {
      const { uuid, token } = await getTokens();

      // Route 1: Specific RVM bin-status (/api/rvms/:id/bin-status or ?rvmId=:id)
      const rvmIdMatch = pathname.match(/\/api\/rvms\/(\d+)\/bin-status/);
      const rvmId = rvmIdMatch ? rvmIdMatch[1] : url.searchParams.get('rvmId');
      if (rvmId) {
        const binRes = await fetch(`https://bts.bcrs.sg/ab0capi/v10/${uuid}/locations/rvms/${rvmId}/bin-status`, {
          headers: { ...HEADERS, 'x-bcrs-map-token': token }
        }).then(r => r.json());

        return new Response(JSON.stringify(binRes), {
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
            'Cache-Control': forceRefresh ? 'no-cache, no-store' : 'public, max-age=15',
          }
        });
      }

      // Route 2: All RVMs (/api/rvms, /rvms or root /)
      const locRes = await fetch(`https://bts.bcrs.sg/ab0capi/v10/${uuid}/locations`, {
        headers: { ...HEADERS, 'x-bcrs-map-token': token }
      }).then(r => r.json());

      if (!Array.isArray(locRes?.data)) {
        throw new Error('Unexpected upstream response');
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
          updated_at: item.updated_at || item.updatedAt || fetchTimestamp
        });
      }

      return new Response(JSON.stringify({
        status: 'ok',
        count: cleaned.length,
        updated_at: fetchTimestamp,
        data: cleaned
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
          'Cache-Control': forceRefresh ? 'no-cache, no-store' : 'public, max-age=30, s-maxage=30',
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
