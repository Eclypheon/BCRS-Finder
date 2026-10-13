import { RVM, BinStatusItem } from '../types/rvm';
import fallbackSeed from '../data/seed-rvms.json';

const LOCAL_STORAGE_RVM_KEY = 'bcrs_rvms_cache_v1';
const LOCAL_STORAGE_TIMESTAMP_KEY = 'bcrs_rvms_cache_time';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  address: string;
  building?: string;
  postal: string;
}

// Fetch all Singapore BCRS RVMs with multi-layer resilience
export async function fetchAllRVMs(forceRefresh = false): Promise<RVM[]> {
  // Check local cache first unless force refresh
  if (!forceRefresh) {
    try {
      const cachedTime = localStorage.getItem(LOCAL_STORAGE_TIMESTAMP_KEY);
      const cachedData = localStorage.getItem(LOCAL_STORAGE_RVM_KEY);
      if (cachedTime && cachedData) {
        const ageMs = Date.now() - parseInt(cachedTime, 10);
        if (ageMs < 1000 * 60 * 5) { // 5 minutes cache
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

  // 1. Try local Express API / proxy
  try {
    const res = await fetch(`/api/rvms${forceRefresh ? '?refresh=true' : ''}`, {
      headers: { 'Accept': 'application/json' }
    });
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
  } catch (err) {
    console.info('Proxy API not reachable, attempting public static data...');
  }

  // 2. Try static public JSON
  try {
    const base = import.meta.env.BASE_URL || '/';
    const seedUrl = `${base.replace(/\/$/, '')}/data/seed-rvms.json`;
    const res = await fetch(seedUrl);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.info('Static seed fetch failed, falling back to bundled data...');
  }

  // 3. Fallback to bundled import
  return fallbackSeed as unknown as RVM[];
}

// Fetch bin status for an individual RVM
export async function fetchRvmBinStatus(rvmId: number): Promise<BinStatusItem[]> {
  try {
    const res = await fetch(`/api/rvms/${rvmId}/bin-status`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.status === 'ok' && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch (err) {
    console.warn(`Could not fetch live bin status for RVM ${rvmId}:`, err);
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
