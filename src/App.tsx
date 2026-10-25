import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RVM, UserLocation } from './types/rvm';
import { fetchAllRVMs, fetchRvmBinStatus, geocodePostalCode } from './services/api';
import { calculateDistanceMeters, getMachineStatusInfo, getLatestTimestamp } from './utils/geo';
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
  const [selectedRvmId, setSelectedRvmId] = useState<number | null>(null);
  const [modalRVM, setModalRVM] = useState<RVM | null>(null);
  const [focusedRVM, setFocusedRVM] = useState<RVM | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [telemetryLoadingIds, setTelemetryLoadingIds] = useState<Set<number>>(new Set());

  // Race condition management refs
  const loadRvmsSeqRef = useRef<number>(0);
  const loadRvmsAbortControllerRef = useRef<AbortController | null>(null);
  const binStatusSeqRef = useRef<Map<number, number>>(new Map());
  const geoWatchIdRef = useRef<number | null>(null);
  // True once the user picks a postal code, so live GPS stops overwriting it
  const manualLocationRef = useRef(false);
  const binStatusAbortControllers = useRef<Map<number, AbortController>>(new Map());
  const lastFetchedTelemetryMs = useRef<Map<number, number>>(new Map());
  const activeTargetIdRef = useRef<number | null>(null);

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

  // Enrich target machine with live bin telemetry
  const enrichTargetRvm = useCallback(async (targetId: number, force = false) => {
    // Check if we already have fresh telemetry for this machine (fetched in last 45s)
    const lastFetchedTime = lastFetchedTelemetryMs.current.get(targetId);
    const isFresh = lastFetchedTime && Date.now() - lastFetchedTime < 45000;
    if (!force && isFresh) {
      return;
    }

    const inFlightController = binStatusAbortControllers.current.get(targetId);
    if (!force && inFlightController) {
      // Non-force request is already in progress for this machine; let it resolve without restart
      return;
    }

    // 1. If forced refresh or restart, abort previous pending request for this specific machine
    if (inFlightController) {
      inFlightController.abort();
    }
    const controller = new AbortController();
    binStatusAbortControllers.current.set(targetId, controller);

    // 2. Monotonic sequence ID per machine to strictly prevent out-of-order resolution
    const reqSeq = (binStatusSeqRef.current.get(targetId) || 0) + 1;
    binStatusSeqRef.current.set(targetId, reqSeq);

    setTelemetryLoadingIds((prev) => new Set(prev).add(targetId));

    try {
      const binItems = await fetchRvmBinStatus(targetId, force, controller.signal);

      // Stale check: if another request for this machine started, discard this result
      if (binStatusSeqRef.current.get(targetId) !== reqSeq) {
        return;
      }

      if (!binItems || binItems.length === 0) return;

      lastFetchedTelemetryMs.current.set(targetId, Date.now());

      const maxPct = Math.max(
        ...binItems.map((b) => (typeof b.threshold_level === 'number' ? b.threshold_level : 0))
      );

      // Extract valid actual timestamps from bin status items
      const validTimestamps = binItems
        .map((b) => b.last_updated)
        .filter((t): t is string => Boolean(t && !isNaN(new Date(t).getTime())));

      // Sort descending to find newest real telemetry timestamp
      validTimestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      const freshestTime = validTimestamps[0] || null;

      setRvms((prev) =>
        prev.map((item) => {
          if (item.id !== targetId) return item;

          const existingTimestamp =
            item.last_updated ||
            item.binStatusDetails?.find((b) => b.last_updated)?.last_updated;

          // Live hardware sensor timestamp takes precedence; fallback to previous timestamp
          const newestTime = freshestTime || existingTimestamp;

          const isFull = maxPct >= 100;
          const isErrorOrOffline = ['OFFLINE', 'CLEANING', 'SUSPENDED', 'MAINTENANCE', 'ERROR', 'UNKNOWN'].includes(
            (item.rawStatus || item.status || '').toUpperCase()
          );

          // If sensor says >= 100%, it is FULL. If emptied (< 100%) and wasn't offline/error, it is RUNNING.
          const nextStatus = isFull ? 'FULL' : isErrorOrOffline ? item.status : 'RUNNING';
          const nextRawStatus = isFull ? 'FULL' : isErrorOrOffline ? item.rawStatus : 'RUNNING';

          return {
            ...item,
            status: nextStatus,
            rawStatus: nextRawStatus,
            binStatusDetails: binItems,
            binFillPct: maxPct,
            last_updated: newestTime,
            updated_at: newestTime,
          };
        })
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.info(`Could not fetch live bin status for machine ${targetId}:`, err);
    } finally {
      if (binStatusSeqRef.current.get(targetId) === reqSeq) {
        setTelemetryLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        binStatusAbortControllers.current.delete(targetId);
      }
    }
  }, []);

  const loadRvms = async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshing(true);
    else setIsLoadingRvms(true);

    // Abort prior in-flight full load
    if (loadRvmsAbortControllerRef.current) {
      loadRvmsAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    loadRvmsAbortControllerRef.current = controller;

    // Sequence tracking for full loads to prevent earlier responses from overwriting later ones
    const seq = ++loadRvmsSeqRef.current;

    // In PWA, check for service worker updates on manual refresh
    if (forceRefresh && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.update().catch(() => {});
      }).catch(() => {});
    }

    // Immediately kick off live telemetry sync for the active target machine concurrently!
    const targetId = activeTargetIdRef.current || selectedRvmId;
    if (targetId && forceRefresh) {
      enrichTargetRvm(targetId, true);
    }

    const startTime = Date.now();
    try {
      const data = await fetchAllRVMs(forceRefresh, controller.signal);

      // Stale check: if a newer refresh started while this was awaiting, abandon
      if (seq !== loadRvmsSeqRef.current) {
        return;
      }

      // Merge data with existing RVM state to preserve real telemetry timestamps and bin status details!
      setRvms((prev) => {
        if (!prev || prev.length === 0) return data;
        const prevMap = new Map(prev.map((r) => [r.id, r]));

        return data.map((newItem) => {
          const existing = prevMap.get(newItem.id);
          if (!existing) return newItem;

          // Preserve existing real telemetry
          const existingTime =
            existing.last_updated ||
            existing.binStatusDetails?.find((b) => b.last_updated)?.last_updated;
          const newTime =
            newItem.last_updated ||
            newItem.binStatusDetails?.find((b) => b.last_updated)?.last_updated;

          const latestTime = getLatestTimestamp(existingTime, newTime);

          const existingFillPct = typeof existing.binFillPct === 'number' ? existing.binFillPct : null;
          const newFillPct = typeof newItem.binFillPct === 'number' ? newItem.binFillPct : null;
          const effectiveFillPct = existingFillPct ?? newFillPct;

          // Priority 1: Upstream status from live data (FULL, ERROR, OFFLINE, RUNNING)
          // Priority 2: If live sensor telemetry on this machine is >= 100%, mark FULL
          const isUpstreamFull = newItem.status === 'FULL' || newItem.rawStatus === 'FULL';
          const isTelemetryFull = Boolean(effectiveFillPct && effectiveFillPct >= 100);
          const isFull = isUpstreamFull || isTelemetryFull;

          let finalStatus = newItem.status;
          let finalRawStatus = newItem.rawStatus;

          if (isFull) {
            finalStatus = 'FULL';
            finalRawStatus = 'FULL';
          }

          return {
            ...newItem,
            status: finalStatus,
            rawStatus: finalRawStatus,
            binStatusDetails: existing.binStatusDetails || newItem.binStatusDetails,
            binFillPct: effectiveFillPct ?? undefined,
            last_updated: latestTime,
            updated_at: latestTime,
          };
        });
      });

      setLastUpdated(new Date());

      // If active target machine changed during fetchAllRVMs, refresh it now
      const latestTargetId = activeTargetIdRef.current || selectedRvmId;
      if (latestTargetId && latestTargetId !== targetId && forceRefresh) {
        enrichTargetRvm(latestTargetId, true);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      if (seq === loadRvmsSeqRef.current) {
        console.error('Failed to load RVMs:', err);
        setErrorMessage('Could not load BCRS machines. Using cached data.');
      }
    } finally {
      if (seq === loadRvmsSeqRef.current) {
        if (forceRefresh) {
          const elapsed = Date.now() - startTime;
          if (elapsed < 500) {
            await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
          }
        }
        setIsLoadingRvms(false);
        setIsRefreshing(false);
      }
    }
  };

  // 1. Initial Load: Fetch RVMs and request live location
  useEffect(() => {
    loadRvms();
    requestLiveLocation(true); // silent attempt on initial load
  }, []);

  // 2. Follow Live Geolocation (continuous watch, so the dot moves as the user walks)
  const requestLiveLocation = useCallback((silent = false) => {
    if (!navigator.geolocation) {
      if (!silent) setErrorMessage('Geolocation is not supported by your browser.');
      setUserLocation(DEFAULT_SG_LOCATION);
      return;
    }

    manualLocationRef.current = false;
    if (!silent) setErrorMessage(null);

    // Keep a single watch running; it survives until permission is denied
    if (geoWatchIdRef.current !== null) return;

    setIsLoadingLocation(true);
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setIsLoadingLocation(false);
        if (manualLocationRef.current) return;
        const { latitude, longitude, accuracy } = position.coords;
        setUserLocation((current) =>
          current.isLiveGps &&
          Math.abs(current.latitude - latitude) < 1e-6 &&
          Math.abs(current.longitude - longitude) < 1e-6
            ? current
            : { latitude, longitude, label: 'Live Location', isLiveGps: true, accuracy }
        );
      },
      (error) => {
        setIsLoadingLocation(false);
        console.info('Geolocation error / permission:', error.message);
        if (error.code === error.PERMISSION_DENIED) {
          // Terminal: stop watching so the Live GPS button can retry cleanly
          if (geoWatchIdRef.current !== null) {
            navigator.geolocation.clearWatch(geoWatchIdRef.current);
            geoWatchIdRef.current = null;
          }
          if (!silent) setErrorMessage('Location permission denied. Enter your postal code above.');
          return;
        }
        if (!silent) setErrorMessage('Unable to retrieve GPS position. Enter your postal code above.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
      }
    );
  }, []);

  // Stop the GPS watch when the app unmounts
  useEffect(() => {
    return () => {
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
    };
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

      // A chosen postal code wins over live GPS until the user asks for Live again
      manualLocationRef.current = true;
      setUserLocation({
        latitude: result.latitude,
        longitude: result.longitude,
        postalCode: result.postal,
        label: result.building || result.address.split(',')[0] || `Postal ${result.postal}`,
        address: result.address,
        isLiveGps: false,
      });
      setSelectedRvmId(null);
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

  // 6. Active Target RVM: derived dynamically from freshest rvmsWithDistance!
  const activeTargetRVM = useMemo(() => {
    if (selectedRvmId) {
      const match = rvmsWithDistance.find((r) => r.id === selectedRvmId);
      if (match) return match;
    }
    return nearestOperatingRVM;
  }, [selectedRvmId, rvmsWithDistance, nearestOperatingRVM]);

  // When active target ID changes, keep ref updated and fetch its live bin status
  useEffect(() => {
    activeTargetIdRef.current = activeTargetRVM?.id || null;
    if (!activeTargetRVM?.id) return;
    enrichTargetRvm(activeTargetRVM.id, false);
  }, [activeTargetRVM?.id, enrichTargetRvm]);

  // Proactively fetch live telemetry for the closest 3 machines so full bins never masquerade as available
  useEffect(() => {
    if (!rvmsWithDistance || rvmsWithDistance.length === 0) return;
    const candidates = rvmsWithDistance.slice(0, 3);
    for (const c of candidates) {
      enrichTargetRvm(c.id, false);
    }
  }, [rvmsWithDistance, enrichTargetRvm]);

  // When modal machine opens, ensure fresh telemetry is fetched
  useEffect(() => {
    if (modalRVM?.id) {
      enrichTargetRvm(modalRVM.id, false);
    }
  }, [modalRVM?.id, enrichTargetRvm]);

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
            title={
              lastUpdated
                ? `Last synced: ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • Click to re-sync`
                : 'Refresh Live Status'
            }
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
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

          {/* 2. Target Operating Bin with Instant 1-Click Navigation Icons */}
          <NearestOperatingBin
            rvm={activeTargetRVM}
            userLocation={userLocation}
            onFocusOnMap={(rvm) => {
              setFocusedRVM(rvm);
              activeTargetIdRef.current = rvm.id;
              setSelectedRvmId(rvm.id);
              enrichTargetRvm(rvm.id, true);
            }}
            isCustomSelected={Boolean(selectedRvmId && selectedRvmId !== nearestOperatingRVM?.id)}
            onResetToNearest={() => {
              setSelectedRvmId(null);
              if (nearestOperatingRVM?.id) {
                activeTargetIdRef.current = nearestOperatingRVM.id;
                enrichTargetRvm(nearestOperatingRVM.id, true);
              }
            }}
            isSyncingTelemetry={Boolean(
              activeTargetRVM?.id &&
                (telemetryLoadingIds.has(activeTargetRVM.id) ||
                  (isRefreshing && activeTargetRVM.id === (activeTargetIdRef.current || selectedRvmId || nearestOperatingRVM?.id)))
            )}
          />
        </div>

        {/* BOTTOM SECTION: Map Centered on Location + Safe Area Bottom Spacer */}
        <div className="flex-1 min-h-0 px-3 sm:px-6 pt-0 flex flex-col">
          {/* Map Container - cleanly bounded inside flex column */}
          <div className="flex-1 min-h-0 relative">
            <MapView
              userLocation={userLocation}
              rvms={rvmsWithDistance}
              onSelectRVM={(rvm) => {
                const currentTargetId = activeTargetRVM?.id;
                if (currentTargetId === rvm.id) {
                  // Second tap on the same dot -> open details & navigation modal!
                  setModalRVM(rvm);
                } else {
                  // First tap on this dot -> dynamically reroute walking path!
                  activeTargetIdRef.current = rvm.id;
                  setSelectedRvmId(rvm.id);
                  enrichTargetRvm(rvm.id, true);
                }
              }}
              focusedRVM={focusedRVM}
              onClearFocus={() => setFocusedRVM(null)}
              targetRVM={activeTargetRVM}
            />
          </div>

          {/* Dedicated bottom spacer to prevent map from stretching into unsafe area / home indicator */}
          <div
            className="shrink-0 w-full h-3 box-content pb-[max(env(safe-area-inset-bottom,0px),0.5rem)]"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Navigation Modal - only opens on second tap */}
      <NavigationModal
        rvm={modalRVM ? rvmsWithDistance.find((r) => r.id === modalRVM.id) || modalRVM : null}
        userLocation={userLocation}
        onClose={() => setModalRVM(null)}
      />

      {/* PWA Install Banner */}
      <PWAInstallBanner />
    </div>
  );
};

export default App;
