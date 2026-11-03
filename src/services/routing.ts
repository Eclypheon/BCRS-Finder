// Routing Service supporting Singapore SLA OneMap (Walking) & OSRM (Driving & Fallback)
// - Walking (default): Queries SLA OneMap pedestrian API via Cloudflare Worker proxy, fallback to OSRM walking
// - Driving: Queries OpenStreetMap OSRM driving engine

export type TravelMode = 'walking' | 'driving';

export interface RouteResult {
  coordinates: [number, number][]; // [lat, lng] array formatted for Leaflet polylines
  distanceMeters: number;
  durationSeconds: number;
  provider: 'onemap' | 'osrm' | 'fallback';
  mode: TravelMode;
}

const routeCache = new Map<string, RouteResult>();

// Default to Cloudflare Edge Proxy which auto-renews OneMap tokens
const DEFAULT_PROXY = 'https://bcrs-finder-proxy.kester-neo.workers.dev';
const PROXY_URL = (import.meta.env.VITE_BCRS_PROXY_URL || DEFAULT_PROXY).replace(/\/$/, '');

/**
 * Decodes Google Encoded Polyline format returned by OneMap API
 * into an array of Leaflet [latitude, longitude] pairs.
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/**
 * Gets a manually overridden OneMap token if one was set locally
 */
export function getOnemapToken(): string | null {
  try {
    return (
      (window as any).ONEMAP_TOKEN ||
      localStorage.getItem('onemap_token') ||
      import.meta.env.VITE_ONEMAP_TOKEN ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * Sets a manual OneMap token in localStorage (optional override)
 */
export function setOnemapToken(token: string): void {
  try {
    localStorage.setItem('onemap_token', token.trim());
    (window as any).ONEMAP_TOKEN = token.trim();
  } catch {}
}

if (typeof window !== 'undefined') {
  (window as any).setOnemapToken = setOnemapToken;
  (window as any).getOnemapToken = getOnemapToken;
}

/**
 * Queries the official SLA OneMap pedestrian walking route API
 * via Cloudflare Worker proxy (or direct if token is available).
 */
async function fetchOneMapWalkingRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<RouteResult | null> {
  const startCoord = `${startLat.toFixed(6)},${startLng.toFixed(6)}`;
  const endCoord = `${endLat.toFixed(6)},${endLng.toFixed(6)}`;

  // 1. Query Cloudflare Edge Proxy (automated OneMap token renewal)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const proxyRouteUrl = `${PROXY_URL}/route?start=${startCoord}&end=${endCoord}&routeType=walk`;
    const res = await fetch(proxyRouteUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const geom = data?.route_geometry;
      if (geom && typeof geom === 'string') {
        const decoded = decodePolyline(geom);
        if (decoded.length > 0) {
          return {
            coordinates: decoded,
            distanceMeters: Math.round(data?.route_summary?.total_distance || 0),
            durationSeconds: Math.round(data?.route_summary?.total_time || 0),
            provider: 'onemap',
            mode: 'walking',
          };
        }
      }
    }
  } catch (err: any) {
    console.info('Proxy OneMap route lookup failed, attempting direct/fallback:', err?.message);
  }

  // 2. Direct OneMap call if manual token is stored locally
  const localToken = getOnemapToken();
  if (localToken) {
    try {
      const directUrl = `https://www.onemap.gov.sg/api/public/routingsvc/route?start=${startCoord}&end=${endCoord}&routeType=walk`;
      const res = await fetch(directUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: localToken.startsWith('Bearer ') ? localToken : localToken,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const geom = data?.route_geometry;
        if (geom && typeof geom === 'string') {
          const decoded = decodePolyline(geom);
          if (decoded.length > 0) {
            return {
              coordinates: decoded,
              distanceMeters: Math.round(data?.route_summary?.total_distance || 0),
              durationSeconds: Math.round(data?.route_summary?.total_time || 0),
              provider: 'onemap',
              mode: 'walking',
            };
          }
        }
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Queries OpenStreetMap OSRM routing engine (walking or driving)
 */
async function fetchOSRMRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  mode: TravelMode
): Promise<RouteResult | null> {
  const profile = mode === 'driving' ? 'driving' : 'walking';
  const osrmUrl = `https://router.project-osrm.org/route/v1/${profile}/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data?.code === 'Ok' && Array.isArray(data?.routes) && data.routes.length > 0) {
        const primary = data.routes[0];
        const rawCoords: [number, number][] = primary.geometry.coordinates;
        const latLngs: [number, number][] = rawCoords.map(([lng, lat]) => [lat, lng]);

        return {
          coordinates: latLngs,
          distanceMeters: Math.round(primary.distance || 0),
          durationSeconds: Math.round(primary.duration || 0),
          provider: 'osrm',
          mode,
        };
      }
    }
  } catch (err: any) {
    console.info(`OSRM ${mode} lookup failed:`, err?.message);
  }
  return null;
}

/**
 * Unified route fetcher:
 * - Default (Walking): OneMap API primary, OSRM walking fallback
 * - Driving: OSRM driving engine
 */
export async function fetchRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  mode: TravelMode = 'walking'
): Promise<RouteResult> {
  const cacheKey = `${mode}_${startLat.toFixed(5)},${startLng.toFixed(5)}_${endLat.toFixed(5)},${endLng.toFixed(5)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  // 1. If Driving mode: use OSRM driving routing
  if (mode === 'driving') {
    const osrmDrive = await fetchOSRMRoute(startLat, startLng, endLat, endLng, 'driving');
    if (osrmDrive) {
      if (routeCache.size > 100) {
        const firstKey = routeCache.keys().next().value;
        if (firstKey) routeCache.delete(firstKey);
      }
      routeCache.set(cacheKey, osrmDrive);
      return osrmDrive;
    }
  } else {
    // 2. If Walking mode: Default OneMap API
    const onemapWalk = await fetchOneMapWalkingRoute(startLat, startLng, endLat, endLng);
    if (onemapWalk) {
      if (routeCache.size > 100) {
        const firstKey = routeCache.keys().next().value;
        if (firstKey) routeCache.delete(firstKey);
      }
      routeCache.set(cacheKey, onemapWalk);
      return onemapWalk;
    }

    // Fallback: OSRM walking
    const osrmWalk = await fetchOSRMRoute(startLat, startLng, endLat, endLng, 'walking');
    if (osrmWalk) {
      if (routeCache.size > 100) {
        const firstKey = routeCache.keys().next().value;
        if (firstKey) routeCache.delete(firstKey);
      }
      routeCache.set(cacheKey, osrmWalk);
      return osrmWalk;
    }
  }

  // 3. Final Fallback: Direct straight dotted line
  const fallbackResult: RouteResult = {
    coordinates: [
      [startLat, startLng],
      [endLat, endLng],
    ],
    distanceMeters: 0,
    durationSeconds: 0,
    provider: 'fallback',
    mode,
  };
  return fallbackResult;
}

// Backward compatibility aliases
export const fetchWalkingRoute = fetchRoute;
export type WalkingRouteResult = RouteResult;
