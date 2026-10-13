import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { RVM, UserLocation, FilterOption } from '../types/rvm';
import { getMachineStatusInfo, formatDistance } from '../utils/geo';
import { Compass, Locate, Filter, Layers } from 'lucide-react';

interface MapViewProps {
  userLocation: UserLocation | null;
  rvms: RVM[];
  onSelectRVM: (rvm: RVM) => void;
  focusedRVM: RVM | null;
  onClearFocus: () => void;
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
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);

  const [activeFilter, setActiveFilter] = useState<FilterOption>('ALL');
  const [mapStyle, setMapStyle] = useState<'onemap' | 'osm' | 'dark'>('onemap');

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const initialLat = userLocation?.latitude || 1.3521;
    const initialLng = userLocation?.longitude || 103.8198;
    const initialZoom = userLocation ? 15 : 12;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: initialZoom,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    });

    // Add free open-source tile layer (OneMap SG HD default)
    const activeCfg = TILE_CONFIGS[mapStyle];
    L.tileLayer(activeCfg.url, {
      maxZoom: activeCfg.maxZoom,
      attribution: activeCfg.attribution,
    }).addTo(map);

    // Zoom control in bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Canvas renderer for smooth rendering of 1,400+ dots
    const canvas = L.canvas({ padding: 0.5 });
    canvasRendererRef.current = canvas;

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

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
  }, [mapStyle]);

  // Update User Marker & center map when user location changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userLocation) return;

    const userLatLng: L.LatLngExpression = [userLocation.latitude, userLocation.longitude];

    // Pulsing custom user location icon
    const userHtml = `
      <div class="relative flex items-center justify-center w-8 h-8">
        <div class="absolute w-7 h-7 rounded-full bg-blue-500/40 animate-ping"></div>
        <div class="relative w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg shadow-blue-500/50"></div>
      </div>
    `;

    const userIcon = L.divIcon({
      html: userHtml,
      className: 'user-location-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(userLatLng);
    } else {
      userMarkerRef.current = L.marker(userLatLng, {
        icon: userIcon,
        zIndexOffset: 1000,
      }).addTo(map);

      userMarkerRef.current.bindTooltip(
        `<div class="font-bold text-xs">Your Location</div><div class="text-[11px] text-slate-400">${
          userLocation.label || userLocation.postalCode || 'Current Position'
        }</div>`,
        { direction: 'top', offset: [0, -12] }
      );
    }

    // Pan map to user
    map.setView(userLatLng, Math.max(map.getZoom(), 14), { animate: true });
  }, [userLocation]);

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
      if (activeFilter === 'FILLING_FAST') return statusInfo.category === 'FILLING_FAST';
      if (activeFilter === 'FULL') return statusInfo.category === 'FULL';
      if (activeFilter === 'OFFLINE') return statusInfo.category === 'OFFLINE';
      return true;
    });

    filtered.forEach((rvm) => {
      const statusInfo = getMachineStatusInfo(rvm);
      const isFull = statusInfo.category === 'FULL';
      const isFillingFast = statusInfo.category === 'FILLING_FAST';

      // Colored dot marker
      const circle = L.circleMarker([rvm.latitude, rvm.longitude], {
        renderer: canvas,
        radius: isFull ? 8 : isFillingFast ? 7.5 : 6.5,
        fillColor: statusInfo.hex,
        color: '#0f172a',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.95,
      });

      // Tooltip with clean details
      const distanceText = rvm.distanceMeters !== undefined ? formatDistance(rvm.distanceMeters) : '';
      const tooltipContent = `
        <div class="p-1 min-w-[160px] text-slate-900">
          <div class="font-bold text-xs truncate leading-tight">${rvm.locationName}</div>
          <div class="flex items-center gap-1.5 mt-1">
            <span class="inline-block w-2 h-2 rounded-full" style="background-color: ${statusInfo.hex}"></span>
            <span class="text-[11px] font-semibold">${statusInfo.label}</span>
            ${distanceText ? `<span class="text-[11px] text-slate-500 font-bold ml-auto">${distanceText}</span>` : ''}
          </div>
          <div class="text-[10px] text-slate-500 mt-0.5">Click dot for GPS navigation</div>
        </div>
      `;

      circle.bindTooltip(tooltipContent, {
        direction: 'top',
        offset: [0, -6],
        className: 'rvm-map-tooltip',
      });

      // Clicking on dot pops up navigation modal
      circle.on('click', () => {
        onSelectRVM(rvm);
      });

      circle.addTo(markersGroup);
    });
  }, [rvms, activeFilter, onSelectRVM]);

  // Recenter button click handler
  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    if (!map || !userLocation) return;
    map.flyTo([userLocation.latitude, userLocation.longitude], 15, {
      duration: 1,
    });
  };

  // Status Counts for Legend
  const counts = React.useMemo(() => {
    let running = 0;
    let filling = 0;
    let full = 0;
    let offline = 0;
    for (const rvm of rvms) {
      const s = getMachineStatusInfo(rvm).category;
      if (s === 'RUNNING') running++;
      else if (s === 'FILLING_FAST') filling++;
      else if (s === 'FULL') full++;
      else if (s === 'OFFLINE') offline++;
    }
    return { all: rvms.length, running, filling, full, offline };
  }, [rvms]);

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
      {/* The Leaflet Map container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Filter Pills / Legend at Top of Map */}
      <div className="absolute top-3 left-3 right-3 z-[500] pointer-events-none">
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pointer-events-auto">
          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl shadow-lg">
            <button
              type="button"
              onClick={() => setActiveFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeFilter === 'RUNNING'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-emerald-400 hover:bg-emerald-950/40'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>In Operation</span>
              <span className="opacity-80 font-normal">({counts.running})</span>
            </button>

            {/* Yellow: Filling Fast */}
            <button
              type="button"
              onClick={() => setActiveFilter('FILLING_FAST')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeFilter === 'FILLING_FAST'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-amber-400 hover:bg-amber-950/40'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>Filling Fast</span>
              {counts.filling > 0 && <span className="opacity-80 font-normal">({counts.filling})</span>}
            </button>

            {/* Red: Bin Full */}
            <button
              type="button"
              onClick={() => setActiveFilter('FULL')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeFilter === 'FULL'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-rose-400 hover:bg-rose-950/40'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              <span>Bin Full</span>
              <span className="opacity-80 font-normal">({counts.full})</span>
            </button>
          </div>

          {/* Map Layer Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl shadow-lg shrink-0">
            <button
              type="button"
              onClick={() =>
                setMapStyle((s) => (s === 'onemap' ? 'osm' : s === 'osm' ? 'dark' : 'onemap'))
              }
              title={`Switch Basemap: currently ${TILE_CONFIGS[mapStyle].name}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">{TILE_CONFIGS[mapStyle].name}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Recenter Button */}
      {userLocation && (
        <div className="absolute bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 z-[500]">
          <button
            type="button"
            onClick={handleRecenter}
            className="flex items-center gap-2 px-3 py-2 bg-slate-900/95 hover:bg-slate-800 active:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 rounded-xl shadow-xl shadow-black/50 text-xs font-bold backdrop-blur-md transition-all cursor-pointer group"
          >
            <Locate className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
            <span>Recenter</span>
          </button>
        </div>
      )}

      {/* Map Legend Overlay */}
      <div className="absolute bottom-[max(env(safe-area-inset-bottom,0px),1rem)] right-16 z-[500] hidden sm:block pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-1.5 text-[11px] text-slate-300 shadow-lg flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Operating</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span>Filling Fast</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span>Bin Full</span>
          </div>
        </div>
      </div>
    </div>
  );
};
