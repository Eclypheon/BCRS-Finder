import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RVM, UserLocation } from './types/rvm';
import { fetchAllRVMs, fetchRvmBinStatus, geocodePostalCode } from './services/api';
import { calculateDistanceMeters, getMachineStatusInfo } from './utils/geo';
import { SearchBox } from './components/SearchBox';
import { NearestOperatingBin } from './components/NearestOperatingBin';
import { MapView } from './components/MapView';
import { NavigationModal } from './components/NavigationModal';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { RefreshCw, Recycle, Sparkles, Wifi, WifiOff } from 'lucide-react';

// Default Singapore Center (Alkaff Lakeview / Bidadari, central SG)
const DEFAULT_SG_LOCATION: UserLocation = {
  latitude: 1.33649,
  longitude: 103.87377,
  postalCode: '341118',
  label: 'Bidadari (Default)',
  address: '118A Alkaff Crescent, Alkaff Lakeview, Singapore 341118',
  isLiveGps: false,
};

export const App: React.FC = () => {
  const [rvms, setRvms] = useState<RVM[]>([]);
  const [userLocation, setUserLocation] = useState<UserLocation>(DEFAULT_SG_LOCATION);
  const [isLoadingRvms, setIsLoadingRvms] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isLoadingPostal, setIsLoadingPostal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRVM, setSelectedRVM] = useState<RVM | null>(null);
  const [focusedRVM, setFocusedRVM] = useState<RVM | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 1. Initial Load: Fetch RVMs and request live location
  useEffect(() => {
    loadRvms();
    requestLiveLocation(true); // silent attempt on initial load
  }, []);

  const loadRvms = async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshing(true);
    else setIsLoadingRvms(true);

    try {
      const data = await fetchAllRVMs(forceRefresh);
      setRvms(data);
    } catch (err: any) {
      console.error('Failed to load RVMs:', err);
      setErrorMessage('Could not load BCRS machines. Using cached data.');
    } finally {
      setIsLoadingRvms(false);
      setIsRefreshing(false);
    }
  };

  // 2. Request Live Geolocation
  const requestLiveLocation = useCallback(async (silent = false) => {
    if (!navigator.geolocation) {
      if (!silent) setErrorMessage('Geolocation is not supported by your browser.');
      setUserLocation(DEFAULT_SG_LOCATION);
      return;
    }

    setIsLoadingLocation(true);
    if (!silent) setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setUserLocation({
          latitude,
          longitude,
          label: 'Live Location',
          isLiveGps: true,
          accuracy,
        });
        setIsLoadingLocation(false);
      },
      (error) => {
        setIsLoadingLocation(false);
        console.info('Geolocation error / permission:', error.message);
        if (!silent) {
          if (error.code === error.PERMISSION_DENIED) {
            setErrorMessage('Location permission denied. Enter your postal code above.');
          } else {
            setErrorMessage('Unable to retrieve GPS position. Enter your postal code above.');
          }
        }
        // Fall back to default location if no location set yet
        setUserLocation((current) => current || DEFAULT_SG_LOCATION);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, []);

  // 3. Search by Postal Code
  const handleSearchPostal = async (postal: string) => {
    setIsLoadingPostal(true);
    setErrorMessage(null);

    try {
      const result = await geocodePostalCode(postal);
      if (!result) {
        setErrorMessage(`Postal code ${postal} was not found. Please try another Singapore postal code.`);
        return;
      }

      setUserLocation({
        latitude: result.latitude,
        longitude: result.longitude,
        postalCode: result.postal,
        label: result.building || result.address.split(',')[0] || `Postal ${result.postal}`,
        address: result.address,
        isLiveGps: false,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Error looking up postal code');
    } finally {
      setIsLoadingPostal(false);
    }
  };

  // 4. Calculate Distance for All RVMs based on current user location
  const rvmsWithDistance = useMemo(() => {
    if (!userLocation) return rvms;

    return rvms.map((rvm) => {
      const distance = calculateDistanceMeters(
        userLocation.latitude,
        userLocation.longitude,
        rvm.latitude,
        rvm.longitude
      );
      return {
        ...rvm,
        distanceMeters: distance,
      };
    });
  }, [rvms, userLocation]);

  // 5. Compute #1 Nearest Operating Bin
  const nearestOperatingRVM = useMemo(() => {
    if (!userLocation || rvmsWithDistance.length === 0) return null;

    const operatingOnly = rvmsWithDistance.filter((rvm) => {
      const statusInfo = getMachineStatusInfo(rvm);
      return statusInfo.category === 'RUNNING';
    });

    return (
      operatingOnly.sort(
        (a, b) => (a.distanceMeters || Infinity) - (b.distanceMeters || Infinity)
      )[0] || null
    );
  }, [rvmsWithDistance, userLocation]);

  // 6. Enrich Nearest Operating Machine with live bin telemetry
  useEffect(() => {
    if (!nearestOperatingRVM) return;

    let isMounted = true;
    fetchRvmBinStatus(nearestOperatingRVM.id)
      .then((binItems) => {
        if (!isMounted || !binItems || binItems.length === 0) return;
        const maxPct = Math.max(
          ...binItems.map((b) => (typeof b.threshold_level === 'number' ? b.threshold_level : 0))
        );
        setRvms((prev) =>
          prev.map((item) =>
            item.id === nearestOperatingRVM.id
              ? { ...item, binStatusDetails: binItems, binFillPct: maxPct }
              : item
          )
        );
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [nearestOperatingRVM?.id]);

  // Focus on map handler
  const handleFocusRVMOnMap = (rvm: RVM) => {
    setFocusedRVM(rvm);
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header Navbar - with iPhone Dynamic Island / notch safe area */}
      <header className="shrink-0 z-20 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 pb-2.5 pt-[max(env(safe-area-inset-top,0px),0.625rem)] pl-[max(env(safe-area-inset-left,0px),0.75rem)] pr-[max(env(safe-area-inset-right,0px),0.75rem)] flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          {/* Logo */}
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 p-0.5 shadow-md shadow-emerald-900/30 flex items-center justify-center">
            <Recycle className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                BCRS Finder
              </h1>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                SG
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden xs:block">
              Singapore Beverage Container Return Scheme
            </p>
          </div>
        </div>

        {/* Right Header Status & Refresh */}
        <div className="flex items-center gap-2">
          {/* Online indicator */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-400" />
                <span>Live Data</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-amber-400" />
                <span>Offline Cache</span>
              </>
            )}
          </div>

          {/* Machine Count Badge */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>{rvms.length > 0 ? `${rvms.length.toLocaleString()} RVMs` : 'Loading...'}</span>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadRvms(true)}
            disabled={isRefreshing || isLoadingRvms}
            title="Refresh Live Status"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* TOP SECTION: Search Box + #1 Nearest Operating Bin */}
        <div className="shrink-0 z-10 px-3 sm:px-6 pt-2 pb-1.5 space-y-1.5 bg-gradient-to-b from-slate-950 via-slate-950/90 to-transparent">
          {/* 1. Compact Search Box (Postal Code + Find + GPS in 1 line) */}
          <SearchBox
            userLocation={userLocation}
            onSearchPostal={handleSearchPostal}
            onGetLiveLocation={() => requestLiveLocation(false)}
            isLoadingLocation={isLoadingLocation}
            isLoadingPostal={isLoadingPostal}
            errorMessage={errorMessage}
            onClearError={() => setErrorMessage(null)}
          />

          {/* 2. #1 Nearest In-Operation Bin with Instant 1-Click Navigation Icons */}
          <NearestOperatingBin
            rvm={nearestOperatingRVM}
            userLocation={userLocation}
            onFocusOnMap={handleFocusRVMOnMap}
          />
        </div>

        {/* BOTTOM SECTION: Map Centered on Location + Safe Area Bottom Spacer */}
        <div className="flex-1 min-h-0 px-3 sm:px-6 pt-0 flex flex-col">
          {/* Map Container - cleanly bounded inside flex column */}
          <div className="flex-1 min-h-0 relative">
            <MapView
              userLocation={userLocation}
              rvms={rvmsWithDistance}
              onSelectRVM={(rvm) => setSelectedRVM(rvm)}
              focusedRVM={focusedRVM}
              onClearFocus={() => setFocusedRVM(null)}
              targetRVM={selectedRVM || focusedRVM || nearestOperatingRVM}
            />
          </div>

          {/* Dedicated bottom spacer to prevent map from stretching into unsafe area / home indicator */}
          <div
            className="shrink-0 w-full h-3 box-content pb-[max(env(safe-area-inset-bottom,0px),0.5rem)]"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Navigation Modal */}
      <NavigationModal
        rvm={selectedRVM}
        userLocation={userLocation}
        onClose={() => setSelectedRVM(null)}
      />

      {/* PWA Install Banner */}
      <PWAInstallBanner />
    </div>
  );
};

export default App;
