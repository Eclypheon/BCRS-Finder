import { RVM, BinStatusItem } from '../types/rvm';
import fallbackSeed from '../data/seed-rvms.json';

const LOCAL_STORAGE_RVM_KEY = 'bcrs_rvms_cache_v2';
const LOCAL_STORAGE_TIMESTAMP_KEY = 'bcrs_rvms_cache_time_v2';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  address: string;
  building?: string;
  postal: string;
}

const DEFAULT_EDGE_PROXY = 'https://bcrs-finder-proxy.kester-neo.workers.dev';
const getEdgeProxyBase = () => (import.meta.env.VITE_BCRS_PROXY_URL || DEFAULT_EDGE_PROXY).replace(/\/$/, '');

// Fetch all Singapore BCRS RVMs with multi-layer resilience and real-time refresh support
export async function fetchAllRVMs(forceRefresh = false): Promise<RVM[]> {
  // If force refresh, clear local storage cache immediately and purge Workbox cache
  if (forceRefresh) {
    try {
      localStorage.removeItem(LOCAL_STORAGE_RVM_KEY);
      localStorage.removeItem(LOCAL_STORAGE_TIMESTAMP_KEY);
      if ('caches' in window) {
        caches.delete('bcrs-seed-data-cache').catch(() => {});
      }
    } catch (_) {}
  } else {
    // Check local cache (valid for 2 minutes)
    try {
      const cachedTime = localStorage.getItem(LOCAL_STORAGE_TIMESTAMP_KEY);
      const cachedData = localStorage.getItem(LOCAL_STORAGE_RVM_KEY);
      if (cachedTime && cachedData) {
        const ageMs = Date.now() - parseInt(cachedTime, 10);
        if (ageMs < 1000 * 60 * 2) {
          const parsed = JSON.parse(cachedData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Could not read from local storage cache:', e);
    }
  }

  // 1. Try Live Edge Proxy / Backend API (Real-time on-demand sync)
  const edgeProxyBase = getEdgeProxyBase();
  const proxyEndpoints = [
    edgeProxyBase ? `${edgeProxyBase}/api/rvms${forceRefresh ? '?refresh=true' : ''}` : null,
    edgeProxyBase ? `${edgeProxyBase}${forceRefresh ? '?refresh=true' : ''}` : null,
    `/api/rvms${forceRefresh ? '?refresh=true' : ''}`,
  ].filter(Boolean) as string[];

  for (const endpoint of proxyEndpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        mode: 'cors',
        cache: forceRefresh ? 'no-store' : 'default',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        if (json && json.status === 'ok' && Array.isArray(json.data) && json.data.length > 0) {
          try {
            localStorage.setItem(LOCAL_STORAGE_RVM_KEY, JSON.stringify(json.data));
            localStorage.setItem(LOCAL_STORAGE_TIMESTAMP_KEY, Date.now().toString());
          } catch (_) {}
          return json.data;
        }
      }
    } catch (_) {
      // Continue to next endpoint or fallback
    }
  }

  // 2. Fetch fresh static JSON (with cache busting and no-store on refresh)
  try {
    const base = import.meta.env.BASE_URL || '/';
    const cleanBase = base.replace(/\/$/, '');
    const seedUrl = `${cleanBase}/data/seed-rvms.json${forceRefresh ? `?t=${Date.now()}` : ''}`;
    const res = await fetch(seedUrl, {
      cache: forceRefresh ? 'no-store' : 'default',
      headers: {
        'Cache-Control': forceRefresh ? 'no-cache, no-store, must-revalidate' : 'default',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        try {
          localStorage.setItem(LOCAL_STORAGE_RVM_KEY, JSON.stringify(data));
          localStorage.setItem(LOCAL_STORAGE_TIMESTAMP_KEY, Date.now().toString());
        } catch (_) {}
        return data;
      }
    }
  } catch (err) {
    console.info('Local seed fetch failed, trying GitHub raw backup...');
  }

  // 3. Fallback to GitHub Raw CDN (CORS enabled, bypasses host)
  try {
    const rawUrl = `https://raw.githubusercontent.com/Eclypheon/BCRS-Finder/main/public/data/seed-rvms.json${forceRefresh ? `?t=${Date.now()}` : ''}`;
    const res = await fetch(rawUrl, {
      cache: forceRefresh ? 'no-store' : 'default',
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        try {
          localStorage.setItem(LOCAL_STORAGE_RVM_KEY, JSON.stringify(data));
          localStorage.setItem(LOCAL_STORAGE_TIMESTAMP_KEY, Date.now().toString());
        } catch (_) {}
        return data;
      }
    }
  } catch (_) {}

  // 4. Fallback to bundled import
  return fallbackSeed as unknown as RVM[];
}

// Fetch bin status for an individual RVM
export async function fetchRvmBinStatus(rvmId: number): Promise<BinStatusItem[]> {
  const edgeProxyBase = getEdgeProxyBase();
  const endpoints = [
    edgeProxyBase ? `${edgeProxyBase}/api/rvms/${rvmId}/bin-status` : null,
    edgeProxyBase ? `${edgeProxyBase}/api/bin-status?id=${rvmId}` : null,
    edgeProxyBase ? `${edgeProxyBase}?rvmId=${rvmId}` : null,
    `/api/rvms/${rvmId}/bin-status`,
  ].filter(Boolean) as string[];

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json && json.status === 'ok' && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch (_) {}
  }

  return [];
}

// Geocode a 6-digit postal code using OneMap Singapore (via proxy or direct)
export async function geocodePostalCode(postalCode: string): Promise<GeocodeResult | null> {
  const cleaned = postalCode.replace(/\D/g, '').trim();
  if (cleaned.length !== 6) {
    throw new Error('Please enter a valid 6-digit Singapore postal code');
  }

  // 1. Try backend geocode endpoint
  try {
    const res = await fetch(`/api/geocode?postal=${encodeURIComponent(cleaned)}`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.status === 'ok' && json.found && json.data) {
        return {
          latitude: json.data.latitude,
          longitude: json.data.longitude,
          address: json.data.address,
          building: json.data.building,
          postal: json.data.postal || cleaned
        };
      }
    }
  } catch (e) {
    console.info('Backend geocode failed, trying direct OneMap...');
  }

  // 2. Try direct OneMap Elastic Search API
  try {
    const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(cleaned)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json && json.results && json.results.length > 0) {
        const item = json.results[0];
        return {
          latitude: parseFloat(item.LATITUDE),
          longitude: parseFloat(item.LONGITUDE),
          address: item.ADDRESS || item.SEARCHVAL,
          building: item.BUILDING,
          postal: item.POSTAL || cleaned
        };
      }
    }
  } catch (e) {
    console.info('Direct OneMap search failed, trying local dataset...');
  }

  // 3. Match against known BCRS RVMs by postal code
  const rvms = fallbackSeed as unknown as RVM[];
  const match = rvms.find(r => r.postalCode === cleaned);
  if (match) {
    return {
      latitude: match.latitude,
      longitude: match.longitude,
      address: match.address || match.locationName,
      building: match.locationName,
      postal: match.postalCode
    };
  }

  return null;
}
