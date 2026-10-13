import { RVM, StatusStyleInfo, BinStatusItem } from '../types/rvm';

// Calculate distance between two lat/lng coordinates in meters using the Haversine formula
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Format distance human-readably (e.g., '150 m', '1.2 km')
export function formatDistance(meters?: number): string {
  if (meters === undefined || isNaN(meters)) return '--';
  if (meters < 1000) {
    return `${meters} m`;
  }
  const km = (meters / 1000).toFixed(1);
  return `${km} km`;
}

// Estimate walking time (approx 5 km/h ~ 83 m/min)
export function estimateWalkMinutes(meters?: number): number {
  if (!meters || meters <= 0) return 1;
  return Math.max(1, Math.round(meters / 80));
}

// Classify machine status into Green (In Operation), Yellow (Filling Fast), Red (Bin Full), or Gray (Offline)
export function getMachineStatusInfo(rvm: RVM, binItems?: BinStatusItem[]): StatusStyleInfo {
  const raw = (rvm.status || '').toUpperCase().trim();
  const items = binItems || rvm.binStatusDetails || [];
  
  // Find highest threshold_level if available
  let maxThreshold: number | null = null;
  if (Array.isArray(items) && items.length > 0) {
    for (const item of items) {
      if (typeof item.threshold_level === 'number' && !isNaN(item.threshold_level)) {
        if (maxThreshold === null || item.threshold_level > maxThreshold) {
          maxThreshold = item.threshold_level;
        }
      }
    }
  }

  // 1. Red = Bin Full
  if (raw === 'FULL' || (maxThreshold !== null && maxThreshold >= 100)) {
    return {
      category: 'FULL',
      label: 'Bin Full',
      colorName: 'red',
      hex: '#ef4444',
      bgClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      textClass: 'text-rose-400',
      borderClass: 'border-rose-500',
      ringClass: 'ring-rose-500/50',
      dotClass: 'bg-rose-500'
    };
  }

  // 2. Offline / Stopped / Maintenance
  if (['OFFLINE', 'CLEANING', 'SUSPENDED', 'MAINTENANCE', 'ERROR', 'UNKNOWN'].includes(raw)) {
    return {
      category: 'OFFLINE',
      label: raw === 'OFFLINE' ? 'Offline' : raw === 'MAINTENANCE' ? 'Maintenance' : 'Out of Service',
      colorName: 'gray',
      hex: '#64748b',
      bgClass: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
      textClass: 'text-slate-400',
      borderClass: 'border-slate-500',
      ringClass: 'ring-slate-500/50',
      dotClass: 'bg-slate-400'
    };
  }

  // 3. Green = In Operation
  return {
    category: 'RUNNING',
    label: 'In Operation',
    colorName: 'green',
    hex: '#10b981',
    bgClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500',
    ringClass: 'ring-emerald-500/50',
    dotClass: 'bg-emerald-400'
  };
}

// Generate navigation deep links and web URLs
export interface NavigationLinks {
  googleMapsWeb: string;
  googleMapsApp: string;
  wazeWeb: string;
  wazeApp: string;
  appleMapsWeb: string;
  appleMapsApp: string;
}

export function getNavigationLinks(
  targetLat: number,
  targetLng: number,
  targetAddress?: string,
  userLat?: number,
  userLng?: number
): NavigationLinks {
  const destCoords = `${targetLat.toFixed(6)},${targetLng.toFixed(6)}`;
  const encodedDest = encodeURIComponent(targetAddress ? `${targetAddress}, Singapore` : destCoords);

  // Google Maps: Universal link opens Google Maps app or web
  // If user coords are known, specify origin
  let gWeb = `https://www.google.com/maps/dir/?api=1&destination=${destCoords}&travelmode=walking`;
  if (userLat && userLng) {
    gWeb += `&origin=${userLat.toFixed(6)},${userLng.toFixed(6)}`;
  }
  const gApp = `google.navigation:q=${destCoords}&mode=w`;

  // Waze: Universal link & App link
  const wWeb = `https://waze.com/ul?ll=${destCoords}&navigate=yes`;
  const wApp = `waze://?ll=${destCoords}&navigate=yes`;

  // Apple Maps: Universal link & App scheme
  // dirflg=w means walking directions, dirflg=d means driving
  const aWeb = `https://maps.apple.com/?daddr=${destCoords}&dirflg=w`;
  const aApp = `maps://?daddr=${destCoords}&dirflg=w`;

  return {
    googleMapsWeb: gWeb,
    googleMapsApp: gApp,
    wazeWeb: wWeb,
    wazeApp: wApp,
    appleMapsWeb: aWeb,
    appleMapsApp: aApp
  };
}

// Helper to launch navigation app with smart fallback
export function launchNavigation(appType: 'google' | 'waze' | 'apple', links: NavigationLinks) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (appType === 'google') {
    if (isAndroid) {
      // Android intent link
      window.location.href = links.googleMapsApp;
      setTimeout(() => {
        window.open(links.googleMapsWeb, '_blank', 'noopener,noreferrer');
      }, 500);
    } else {
      window.open(links.googleMapsWeb, '_blank', 'noopener,noreferrer');
    }
  } else if (appType === 'waze') {
    if (isIOS || isAndroid) {
      window.location.href = links.wazeApp;
      setTimeout(() => {
        window.open(links.wazeWeb, '_blank', 'noopener,noreferrer');
      }, 700);
    } else {
      window.open(links.wazeWeb, '_blank', 'noopener,noreferrer');
    }
  } else if (appType === 'apple') {
    if (isIOS) {
      window.location.href = links.appleMapsApp;
      setTimeout(() => {
        window.open(links.appleMapsWeb, '_blank', 'noopener,noreferrer');
      }, 700);
    } else {
      window.open(links.appleMapsWeb, '_blank', 'noopener,noreferrer');
    }
  }
}
