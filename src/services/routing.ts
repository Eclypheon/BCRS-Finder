// Free Walking Routing Service using OpenStreetMap / OSRM (Open Source Routing Machine)
// Operates with zero API keys and returns real pedestrian footpath geometry.

export interface WalkingRouteResult {
  coordinates: [number, number][]; // [lat, lng] array formatted for Leaflet polylines
  distanceMeters: number;
  durationSeconds: number;
}

const routeCache = new Map<string, WalkingRouteResult>();

/**
 * Fetches the walking route between two coordinates in Singapore
 * using the public OpenStreetMap OSRM pedestrian routing engine.
 */
export async function fetchWalkingRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<WalkingRouteResult> {
  const cacheKey = `${startLat.toFixed(4)},${startLng.toFixed(4)}_${endLat.toFixed(4)},${endLng.toFixed(4)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  // OSRM expects coordinates in {lon},{lat} order
  const url = `https://router.project-osrm.org/route/v1/walking/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`OSRM HTTP error: ${res.status}`);
    }

    const data = await res.json();
    if (data?.code === 'Ok' && Array.isArray(data?.routes) && data.routes.length > 0) {
      const primaryRoute = data.routes[0];
      const rawCoords: [number, number][] = primaryRoute.geometry.coordinates;

      // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
      const latLngs: [number, number][] = rawCoords.map(([lng, lat]) => [lat, lng]);

      const result: WalkingRouteResult = {
        coordinates: latLngs,
        distanceMeters: Math.round(primaryRoute.distance || 0),
        durationSeconds: Math.round(primaryRoute.duration || 0),
      };

      // Keep cache size bounded
      if (routeCache.size > 100) {
        const firstKey = routeCache.keys().next().value;
        if (firstKey) routeCache.delete(firstKey);
      }
      routeCache.set(cacheKey, result);

      return result;
    }
  } catch (err: any) {
    console.warn('OSRM walking route lookup failed, falling back to direct line:', err?.message);
  }

  // Graceful fallback: direct dashed line between start and destination
  return {
    coordinates: [
      [startLat, startLng],
      [endLat, endLng],
    ],
    distanceMeters: 0,
    durationSeconds: 0,
  };
}
