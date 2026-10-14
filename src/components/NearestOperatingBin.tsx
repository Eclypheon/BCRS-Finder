import React from 'react';
import { RVM, UserLocation } from '../types/rvm';
import {
  formatDistance,
  estimateWalkMinutes,
  getNavigationLinks,
  launchNavigation,
  formatSingaporeDateTime,
} from '../utils/geo';
import { Footprints, MapPin, Compass, Clock } from 'lucide-react';

interface NearestOperatingBinProps {
  rvm: RVM | null;
  userLocation: UserLocation | null;
  onFocusOnMap: (rvm: RVM) => void;
  isCustomSelected?: boolean;
  onResetToNearest?: () => void;
  isSyncingTelemetry?: boolean;
}

export const NearestOperatingBin: React.FC<NearestOperatingBinProps> = ({
  rvm,
  userLocation,
  onFocusOnMap,
  isCustomSelected = false,
  onResetToNearest,
  isSyncingTelemetry = false,
}) => {
  if (!rvm) {
    return (
      <div className="w-full bg-slate-900/95 border border-slate-800 rounded-xl p-3 text-center text-xs text-slate-400">
        Finding nearest in-operation BCRS machine...
      </div>
    );
  }

  const distanceStr = formatDistance(rvm.distanceMeters);
  const walkMinutes = estimateWalkMinutes(rvm.distanceMeters);
  
  // Authenticated real telemetry timestamp pulled directly from BCRS machine sensor API
  const rawUpdatedAt =
    rvm.last_updated ||
    rvm.binStatusDetails?.find((b) => b.last_updated)?.last_updated ||
    rvm.binStatusDetails?.[0]?.last_updated;
  const formattedTimestamp = formatSingaporeDateTime(rawUpdatedAt);

  const links = getNavigationLinks(
    rvm.latitude,
    rvm.longitude,
    rvm.address || rvm.locationName,
    userLocation?.latitude,
    userLocation?.longitude
  );

  return (
    <div className="w-full bg-slate-900/95 backdrop-blur-md border border-slate-800/90 hover:border-emerald-500/40 rounded-xl p-2.5 sm:p-3 shadow-lg transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Left Info Section */}
        <div className="min-w-0 flex-1">
          {/* Header Row: Badge & Location Name */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {isCustomSelected ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-black uppercase tracking-wider shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                Selected Target
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                #1 Nearest In Operation
              </span>
            )}

            {isCustomSelected && onResetToNearest && (
              <button
                type="button"
                onClick={onResetToNearest}
                className="text-[10px] font-semibold text-slate-400 hover:text-white underline cursor-pointer"
              >
                Reset to #1
              </button>
            )}

            <button
              type="button"
              onClick={() => onFocusOnMap(rvm)}
              title="Focus on map"
              className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer ml-auto sm:ml-0"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Show on map</span>
            </button>
          </div>

          {/* Machine Name */}
          <h2 className="text-sm sm:text-base font-extrabold text-white truncate mt-1 leading-snug">
            {rvm.locationName}
          </h2>

          {/* Metrics Subline: Distance, Walk Time, Postal & Data Timestamp on the same line */}
          <div className="flex items-center gap-1.5 sm:gap-2 mt-1 text-xs text-slate-300 flex-wrap">
            <span className="flex items-center gap-1 font-bold text-emerald-400">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {distanceStr}
            </span>

            <span className="text-slate-600">•</span>

            <span className="flex items-center gap-1 text-slate-300 font-medium">
              <Footprints className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ~{walkMinutes} mins walk
            </span>

            {rvm.postalCode && (
              <>
                <span className="text-slate-600 hidden xs:inline">•</span>
                <span className="text-slate-400 font-mono text-[11px] hidden xs:inline">
                  SG {rvm.postalCode}
                </span>
              </>
            )}

            {isSyncingTelemetry && !formattedTimestamp ? (
              <>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium truncate">
                  <Clock className="w-3 h-3 text-emerald-400 animate-spin shrink-0" />
                  <span>Syncing status...</span>
                </span>
              </>
            ) : formattedTimestamp ? (
              <>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400 font-medium truncate">
                  <Clock
                    className={`w-3 h-3 shrink-0 ${
                      isSyncingTelemetry ? 'text-emerald-400 animate-spin' : 'text-slate-500'
                    }`}
                  />
                  <span>As of {formattedTimestamp}</span>
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* Right Action Section: 3 Instant 1-Click Navigation Icons */}
        <div className="flex items-center gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800">
          <span className="text-[11px] text-slate-400 font-medium mr-1 hidden md:inline">
            1-Tap Navigate:
          </span>

          {/* 1. Google Maps (Instant Launch) */}
          <button
            type="button"
            onClick={() => launchNavigation('google', links)}
            title="Navigate with Google Maps"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-blue-600/20 active:bg-blue-600/30 text-white border border-slate-700/80 hover:border-blue-500/60 shadow-sm transition-all cursor-pointer group"
          >
            {/* Google Maps Logo Icon */}
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
              />
            </svg>
            <span className="text-xs font-bold text-slate-200 group-hover:text-blue-300">
              Google
            </span>
          </button>

          {/* 2. Waze (Instant Launch) */}
          <button
            type="button"
            onClick={() => launchNavigation('waze', links)}
            title="Navigate with Waze"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-cyan-600/20 active:bg-cyan-600/30 text-white border border-slate-700/80 hover:border-cyan-500/60 shadow-sm transition-all cursor-pointer group"
          >
            {/* Waze Icon */}
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#00D8FF">
              <circle cx="9" cy="11" r="1.5" fill="#0f172a" />
              <circle cx="15" cy="11" r="1.5" fill="#0f172a" />
              <path
                d="M12 2C6.48 2 2 6.48 2 12c0 1.95.56 3.77 1.53 5.32L2.5 21.5l4.5-.95C8.42 21.49 10.15 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm3.8 13.5c-.5.5-1.3.8-2.3.8s-1.8-.3-2.3-.8c-.3-.3-.3-.8 0-1.1.3-.3.8-.3 1.1 0 .3.3.7.4 1.2.4s.9-.1 1.2-.4c.3-.3.8-.3 1.1 0 .3.3.3.8 0 1.1z"
                fill="#00D8FF"
              />
            </svg>
            <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-300">
              Waze
            </span>
          </button>

          {/* 3. Apple Maps (Instant Launch) */}
          <button
            type="button"
            onClick={() => launchNavigation('apple', links)}
            title="Navigate with Apple Maps"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-emerald-600/20 active:bg-emerald-600/30 text-white border border-slate-700/80 hover:border-emerald-500/60 shadow-sm transition-all cursor-pointer group"
          >
            {/* Apple Maps Icon */}
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#34D399">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 2c2.76 0 5 2.24 5 5 0 2.88-2.88 7.19-5 9.88C9.88 16.19 7 11.88 7 9c0-2.76 2.24-5 5-5z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span className="text-xs font-bold text-slate-200 group-hover:text-emerald-300">
              Apple
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
