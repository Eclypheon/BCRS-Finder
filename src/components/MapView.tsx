import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { RVM, UserLocation, FilterOption } from '../types/rvm';
import { getMachineStatusInfo, calculateBearingDegrees } from '../utils/geo';
import { fetchWalkingRoute, WalkingRouteResult } from '../services/routing';
import { Compass, Locate, Filter, Layers } from 'lucide-react';

interface MapViewProps {
  userLocation: UserLocation | null;
  rvms: RVM[];
  onSelectRVM: (rvm: RVM) => void;
  focusedRVM: RVM | null;
  onClearFocus: () => void;
  targetRVM?: RVM | null;
}

interface TileLayerConfig {
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
}

const TILE_CONFIGS: Record<'onemap' | 'osm' | 'dark', TileLayerConfig> = {
  onemap: {
    name: 'OneMap SG',
    url: 'https://www.onemap.gov.sg/maps/tiles/Default_HD/{z}/{x}/{y}.png',
    attribution:
      '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> &copy; <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>',
    maxZoom: 19,
  },
  osm: {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  dark: {
    name: 'Dark Canvas',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution:
      '&copy; <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a>, HERE, Garmin',
    maxZoom: 16,
  },
};

export const MapView: React.FC<MapViewProps> = ({
  userLocation,
  rvms,
  onSelectRVM,
  focusedRVM,
  onClearFocus,
  targetRVM,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);

  const [activeFilter, setActiveFilter] = useState<FilterOption>('ALL');
  const [mapStyle, setMapStyle] = useState<'osm' | 'onemap' | 'dark'>('osm');
  const [recenterTop, setRecenterTop] = useState<number | null>(null);
  const [walkingRoute, setWalkingRoute] = useState<WalkingRouteResult | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [isHeadingUp, setIsHeadingUp] = useState<boolean>(false);

  const DEFAULT_ZOOM = 16; // 3 zooms out from OSM maxZoom 19

  // Dynamically align the top of the Recenter button to the top of Leaflet's zoom-in (+) button
  const updateRecenterPosition = useCallback(() => {
    if (!mapContainerRef.current) return;
    const zoomInBtn = mapContainerRef.current.querySelector('.leaflet-control-zoom-in');
    if (zoomInBtn) {
      const mapRect = mapContainerRef.current.getBoundingClientRect();
      const btnRect = zoomInBtn.getBoundingClientRect();
      const topOffset = btnRect.top - mapRect.top;
      if (topOffset > 0) {
        setRecenterTop(Math.round(topOffset));
      }
    }
  }, []);

  // Compute effective heading (device compass if available, otherwise azimuth to target machine)
  const effectiveHeading = React.useMemo(() => {
    if (deviceHeading !== null) return deviceHeading;
    if (userLocation && targetRVM) {
      return Math.round(
        calculateBearingDegrees(
          userLocation.latitude,
          userLocation.longitude,
          targetRVM.latitude,
          targetRVM.longitude
        )
      );
    }
    return null;
  }, [deviceHeading, userLocation, targetRVM]);

  // Listen to device orientation / compass sensor
  useEffect(() => {
    let lastHeading = -1;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      let currentHeading: number | null = null;
      if (typeof (e as any).webkitCompassHeading === 'number') {
        currentHeading = (e as any).webkitCompassHeading;
      } else if (typeof e.alpha === 'number') {
        currentHeading = (360 - e.alpha) % 360;
      }

      if (currentHeading !== null && !isNaN(currentHeading)) {
        const rounded = Math.round(currentHeading) % 360;
        if (Math.abs(rounded - lastHeading) > 1.5) {
          lastHeading = rounded;
          setDeviceHeading(rounded);
        }
      }
    };

    window.addEventListener('deviceorientation', handleOrientation as any, true);
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', handleOrientation as any, true);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation as any, true);
      if ('ondeviceorientationabsolute' in window) {
        window.removeEventListener('deviceorientationabsolute', handleOrientation as any, true);
      }
    };
  }, []);

  // Fetch walking path using OpenStreetMap OSRM routing
  useEffect(() => {
    if (!userLocation || !targetRVM) {
      setWalkingRoute(null);
      return;
    }

    let active = true;
    fetchWalkingRoute(
      userLocation.latitude,
      userLocation.longitude,
      targetRVM.latitude,
      targetRVM.longitude
    ).then((result) => {
      if (active) {
        setWalkingRoute(result);
      }
    });

    return () => {
      active = false;
    };
  }, [userLocation?.latitude, userLocation?.longitude, targetRVM?.latitude, targetRVM?.longitude]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const initialLat = userLocation?.latitude || 1.33649;
    const initialLng = userLocation?.longitude || 103.87377;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: DEFAULT_ZOOM,
      minZoom: 11,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    });

    // Add free open-source tile layer (OpenStreetMap default)
    const activeCfg = TILE_CONFIGS[mapStyle];
    L.tileLayer(activeCfg.url, {
      maxZoom: activeCfg.maxZoom,
      attribution: activeCfg.attribution,
    }).addTo(map);

    // Zoom control in bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Dedicated background pane for route polylines so they never block dot clicks
    if (!map.getPane('routePane')) {
      const routePane = map.createPane('routePane');
      routePane.style.zIndex = '350';
    }

    // Dedicated layer group for dotted walking path
    const routeGroup = L.layerGroup().addTo(map);
    routeLayerRef.current = routeGroup;

    // Canvas renderer with generous tolerance (16px) for responsive touch sensing on mobile
    const canvas = L.canvas({ padding: 0.5, tolerance: 16 });
    canvasRendererRef.current = canvas;

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;

    mapInstanceRef.current = map;

    // Trigger alignment once controls are attached
    setTimeout(updateRecenterPosition, 50);
    setTimeout(updateRecenterPosition, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [updateRecenterPosition]);

  // Draw walking path as blue dotted polyline on the map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeGroup = routeLayerRef.current;
    if (!map || !routeGroup) return;

    routeGroup.clearLayers();

    if (walkingRoute && walkingRoute.coordinates.length > 0) {
      // Dark outline underneath for crisp contrast on any map tiles
      const outline = L.polyline(walkingRoute.coordinates, {
        pane: 'routePane',
        interactive: false,
        color: '#020617',
        weight: 6.5,
        dashArray: '3, 8',
        lineCap: 'round',
        lineJoin: 'round',
        opacity: 0.65,
      });

      // Bright blue dotted line for walking path
      const line = L.polyline(walkingRoute.coordinates, {
        pane: 'routePane',
        interactive: false,
        color: '#38bdf8',
        weight: 4.5,
        dashArray: '3, 8',
        lineCap: 'round',
        lineJoin: 'round',
        opacity: 0.95,
      });

      outline.addTo(routeGroup);
      line.addTo(routeGroup);
    }
  }, [walkingRoute]);

  // ResizeObserver to ensure Leaflet map adjusts to container height dynamically
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      mapInstanceRef.current?.invalidateSize();
      updateRecenterPosition();
    });
    observer.observe(mapContainerRef.current);
    window.addEventListener('resize', updateRecenterPosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateRecenterPosition);
    };
  }, [updateRecenterPosition]);

  // Update map tile layer if style changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    const activeCfg = TILE_CONFIGS[mapStyle];
    L.tileLayer(activeCfg.url, {
      maxZoom: activeCfg.maxZoom,
      attribution: activeCfg.attribution,
    }).addTo(map);

    setTimeout(updateRecenterPosition, 100);
  }, [mapStyle, updateRecenterPosition]);

  // Update User Marker with Direction Facing Arrow & center map when user location changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userLocation) return;

    const userLatLng: L.LatLngExpression = [userLocation.latitude, userLocation.longitude];

    // Pulsing dot + directional blue beam / arrow (Google Maps style)
    const userHtml = `
      <div class="user-location-marker relative flex items-center justify-center w-12 h-12 pointer-events-none">
        ${effectiveHeading !== null ? `
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-150 ease-out" style="transform: rotate(${effectiveHeading}deg);">
            <svg class="w-12 h-12 pointer-events-none drop-shadow" viewBox="0 0 48 48" fill="none">
              <!-- Directional beam cone -->
              <path d="M24 24 L13 5 A 21 21 0 0 1 35 5 Z" fill="rgba(56, 189, 248, 0.38)" />
              <!-- Blue directional arrow tip with crisp border -->
              <polygon points="24,1 29,11 24,8.5 19,11" fill="#0284c7" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round" />
            </svg>
          </div>
        ` : `
          <div class="absolute w-7 h-7 rounded-full bg-blue-500/40 animate-ping"></div>
        `}
        <!-- Center blue location dot -->
        <div class="relative w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg shadow-blue-500/60 z-10"></div>
      </div>
    `;

    const userIcon = L.divIcon({
      html: userHtml,
      className: 'user-marker-container',
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(userLatLng);
      userMarkerRef.current.setIcon(userIcon);
    } else {
      userMarkerRef.current = L.marker(userLatLng, {
        icon: userIcon,
        zIndexOffset: 1000,
      }).addTo(map);

      userMarkerRef.current.bindTooltip(
        `<div class="font-bold text-xs">Your Location</div><div class="text-[11px] text-slate-400">${
          userLocation.label || userLocation.postalCode || 'Current Position'
        }</div>`,
        { direction: 'top', offset: [0, -14] }
      );
    }

    // Pan map to user at default zoom
    map.setView(userLatLng, DEFAULT_ZOOM, { animate: true });
  }, [userLocation, effectiveHeading]);

  // Fly to focused RVM if requested
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusedRVM) return;

    map.flyTo([focusedRVM.latitude, focusedRVM.longitude], 17, {
      duration: 1.2,
      easeLinearity: 0.25,
    });
    onClearFocus();
  }, [focusedRVM, onClearFocus]);

  // Render RVM Colored Dots
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    const canvas = canvasRendererRef.current;
    if (!map || !markersGroup || !canvas) return;

    markersGroup.clearLayers();

    // Filter RVMs
    const filtered = rvms.filter((rvm) => {
      const statusInfo = getMachineStatusInfo(rvm);
      if (activeFilter === 'ALL') return true;
      if (activeFilter === 'RUNNING') return statusInfo.category === 'RUNNING';
      if (activeFilter === 'FULL') return statusInfo.category === 'FULL';
      return true;
    });

    filtered.forEach((rvm) => {
      const statusInfo = getMachineStatusInfo(rvm);
      const isFull = statusInfo.category === 'FULL';
      const isTarget = targetRVM?.id === rvm.id;

      // Colored dot marker: Green (In Operation) or Red (Bin Full), with highlight if active routed target
      const circle = L.circleMarker([rvm.latitude, rvm.longitude], {
        renderer: canvas,
        radius: isTarget ? 10.5 : (isFull ? 7.5 : 6.5),
        fillColor: isTarget ? '#38bdf8' : statusInfo.hex,
        color: isTarget ? '#ffffff' : '#0f172a',
        weight: isTarget ? 3 : 1.5,
        opacity: 1,
        fillOpacity: 0.95,
        interactive: true,
      });

      // Clicking / tapping on dot triggers 1st-tap route or 2nd-tap modal
      circle.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectRVM(rvm);
      });

      circle.addTo(markersGroup);
    });
  }, [rvms, activeFilter, onSelectRVM, targetRVM?.id]);

  // Recenter button click handler
  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    if (!map || !userLocation) return;
    map.flyTo([userLocation.latitude, userLocation.longitude], DEFAULT_ZOOM, {
      duration: 0.8,
    });
  };

  // Toggle between North-Up (default) and Heading-Up (direction you are facing)
  const toggleCompassMode = async () => {
    // Request permission on iOS 13+ if needed
    if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response !== 'granted') {
          console.info('Device orientation permission denied');
        }
      } catch (err) {
        console.warn('Orientation permission error:', err);
      }
    }

    setIsHeadingUp((prev) => !prev);
  };

  // Status Counts for Legend
  const counts = React.useMemo(() => {
    let running = 0;
    let full = 0;
    let offline = 0;
    for (const rvm of rvms) {
      const s = getMachineStatusInfo(rvm).category;
      if (s === 'RUNNING') running++;
      else if (s === 'FULL') full++;
      else if (s === 'OFFLINE') offline++;
    }
    return { all: rvms.length, running, full, offline };
  }, [rvms]);

  return (
    <div className="relative w-full h-full min-h-0 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
      {/* The Leaflet Map container with smooth heading rotation */}
      <div
        ref={mapContainerRef}
        className="w-full h-full z-0 origin-center transition-transform duration-300 ease-out"
        style={
          isHeadingUp && effectiveHeading !== null
            ? { transform: `rotate(${-effectiveHeading}deg) scale(1.42)` }
            : { transform: 'rotate(0deg) scale(1)' }
        }
      />

      {/* Floating Controls at Top of Map */}
      <div className="absolute top-2.5 left-2 sm:left-3 right-2 sm:right-3 z-[500] pointer-events-none flex items-center justify-between gap-1.5">
        {/* Status Filter Buttons - shifted to the left, more compact */}
        <div className="flex items-center gap-1 p-0.5 sm:p-1 bg-slate-900/95 backdrop-blur-md border border-slate-800/90 rounded-xl shadow-lg pointer-events-auto">
          <button
            type="button"
            onClick={() => setActiveFilter('ALL')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              activeFilter === 'ALL'
                ? 'bg-slate-700 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({counts.all})
          </button>

          {/* Green: In Operation */}
          <button
            type="button"
            onClick={() => setActiveFilter('RUNNING')}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              activeFilter === 'RUNNING'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-emerald-400 hover:bg-emerald-950/40'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>In Operation</span>
            <span className="opacity-80 font-normal hidden xs:inline">({counts.running})</span>
          </button>

          {/* Red: Bin Full */}
          <button
            type="button"
            onClick={() => setActiveFilter('FULL')}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              activeFilter === 'FULL'
                ? 'bg-rose-600 text-white shadow'
                : 'text-rose-400 hover:bg-rose-950/40'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            <span>Bin Full</span>
            <span className="opacity-80 font-normal hidden xs:inline">({counts.full})</span>
          </button>
        </div>

        {/* Map Layer Switcher - comfortably inside the safe margin on the right */}
        <div className="p-0.5 sm:p-1 bg-slate-900/95 backdrop-blur-md border border-slate-800/90 rounded-xl shadow-lg pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={() =>
              setMapStyle((s) => (s === 'osm' ? 'onemap' : s === 'onemap' ? 'dark' : 'osm'))
            }
            title={`Switch Basemap: currently ${TILE_CONFIGS[mapStyle].name}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden xs:inline">{TILE_CONFIGS[mapStyle].name}</span>
          </button>
        </div>
      </div>

      {/* Floating Left Controls (Recenter + Compass Stack) */}
      {userLocation && (
        <div
          className="absolute left-2 sm:left-3 z-[500] transition-all duration-150 flex flex-col gap-1.5 items-start"
          style={
            recenterTop !== null
              ? { top: `${recenterTop}px` }
              : { bottom: '5rem' }
          }
        >
          {/* Recenter Button */}
          <button
            type="button"
            onClick={handleRecenter}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/95 hover:bg-slate-800 active:bg-slate-700 text-slate-200 hover:text-white border border-slate-800/90 rounded-xl shadow-xl shadow-black/50 text-[11px] font-bold backdrop-blur-md transition-all cursor-pointer group"
          >
            <Locate className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
            <span>Recenter</span>
          </button>

          {/* Compass Button below Recenter */}
          <button
            type="button"
            onClick={toggleCompassMode}
            title={isHeadingUp ? 'Orient North' : 'Orient to Facing Direction'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl shadow-xl shadow-black/50 text-[11px] font-bold backdrop-blur-md transition-all cursor-pointer border ${
              isHeadingUp
                ? 'bg-blue-600/90 hover:bg-blue-500 text-white border-blue-400/80 shadow-blue-500/25'
                : 'bg-slate-900/95 hover:bg-slate-800 active:bg-slate-700 text-slate-200 hover:text-white border-slate-800/90'
            }`}
          >
            <Compass
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isHeadingUp ? 'text-white' : 'text-rose-400'
              }`}
              style={{
                transform: `rotate(${isHeadingUp ? 0 : -(effectiveHeading || 0)}deg)`,
              }}
            />
            <span>{isHeadingUp ? 'Heading Up' : 'North Up'}</span>
          </button>
        </div>
      )}

      {/* Map Legend Overlay */}
      <div className="absolute bottom-2.5 right-14 z-[500] hidden sm:block pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl px-2.5 py-1 text-[10px] text-slate-300 shadow-lg flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>In Operation</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>Bin Full</span>
          </div>
        </div>
      </div>
    </div>
  );
};
