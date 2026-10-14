import React, { useState } from 'react';
import { RVM, UserLocation } from '../types/rvm';
import {
  formatDistance,
  estimateWalkMinutes,
  getMachineStatusInfo,
  getNavigationLinks,
  launchNavigation,
  formatSingaporeDateTime,
} from '../utils/geo';
import {
  X,
  Navigation,
  MapPin,
  Clock,
  Info,
  Check,
  Copy,
  Share2,
  ExternalLink,
  Gauge,
  Footprints,
} from 'lucide-react';

interface NavigationModalProps {
  rvm: RVM | null;
  userLocation: UserLocation | null;
  onClose: () => void;
}

export const NavigationModal: React.FC<NavigationModalProps> = ({
  rvm,
  userLocation,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!rvm) return null;

  const statusInfo = getMachineStatusInfo(rvm);
  const distanceStr = formatDistance(rvm.distanceMeters);
  const walkMinutes = estimateWalkMinutes(rvm.distanceMeters);
  const fillPct =
    typeof rvm.binFillPct === 'number'
      ? rvm.binFillPct
      : typeof rvm.binStatusDetails?.[0]?.threshold_level === 'number'
      ? rvm.binStatusDetails[0].threshold_level
      : null;
  const telemetryTime =
    rvm.last_updated ||
    rvm.binStatusDetails?.find((b) => b.last_updated)?.last_updated ||
    rvm.binStatusDetails?.[0]?.last_updated;
  const formattedTimestamp = formatSingaporeDateTime(telemetryTime);

  const links = getNavigationLinks(
    rvm.latitude,
    rvm.longitude,
    rvm.address || rvm.locationName,
    userLocation?.latitude,
    userLocation?.longitude
  );

  const handleCopyAddress = async () => {
    const fullText = `${rvm.locationName}\n${rvm.address}${rvm.postalCode ? `, Singapore ${rvm.postalCode}` : ''}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `BCRS Machine: ${rvm.locationName}`,
      text: `BCRS Reverse Vending Machine at ${rvm.locationName} (${statusInfo.label}). ${distanceStr} away.`,
      url: links.googleMapsWeb,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        handleCopyAddress();
      }
    } catch (_) {}
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Backdrop click dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Card - safe from Dynamic Island and iOS home bar */}
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 max-h-[92vh] max-h-[calc(100dvh-max(env(safe-area-inset-top,0px),24px))] flex flex-col animate-in slide-in-from-bottom-6 duration-200">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Navigate to BCRS Machine</h3>
              <p className="text-xs text-slate-400">Select your preferred navigation app</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Target Location Card */}
          <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="text-base font-extrabold text-white leading-snug">
                  {rvm.locationName}
                </h4>
                {rvm.address && (
                  <p className="text-xs text-slate-300 mt-1 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>{rvm.address}</span>
                  </p>
                )}
                {rvm.postalCode && (
                  <p className="text-xs text-slate-400 font-mono pl-5">
                    Postal Code: <span className="text-emerald-400 font-semibold">{rvm.postalCode}</span>
                  </p>
                )}
              </div>

              {/* Status Badge & Authentic Telemetry Timestamp */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${statusInfo.bgClass}`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                    style={{ backgroundColor: statusInfo.hex }}
                  />
                  <span>
                    {statusInfo.category === 'FULL' || fillPct === 100
                      ? 'Bin Full (100%)'
                      : fillPct !== null
                      ? `${statusInfo.label} (${fillPct}%)`
                      : statusInfo.label}
                  </span>
                </div>
                {formattedTimestamp && (
                  <span className="text-[10px] text-slate-400 font-medium">
                    As of {formattedTimestamp}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Metrics (Distance & Walk Time) */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/60 text-center">
              <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-[11px] text-slate-400">Distance</div>
                <div className="text-sm font-bold text-emerald-400">{distanceStr}</div>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                  <Footprints className="w-3 h-3 text-slate-400" /> Walking Time
                </div>
                <div className="text-sm font-bold text-slate-200">~{walkMinutes} mins</div>
              </div>
            </div>

            {/* Live Bin Fill Level / Capacity Bar */}
            {fillPct !== null && (
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        fillPct >= 100
                          ? 'bg-rose-500 animate-pulse'
                          : fillPct >= 80
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      }`}
                    />
                    Current Bin Capacity
                  </span>
                  <span
                    className={`font-black text-xs ${
                      fillPct >= 100
                        ? 'text-rose-400'
                        : fillPct >= 80
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {fillPct}% Full
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      fillPct >= 100
                        ? 'bg-rose-500'
                        : fillPct >= 80
                        ? 'bg-amber-400'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, fillPct))}%` }}
                  />
                </div>
                {rvm.binStatusDetails && rvm.binStatusDetails.length > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                    <span>
                      Compartment: {rvm.binStatusDetails.map((b) => b.compartment_type).filter(Boolean).join(', ')}
                    </span>
                    {rvm.binStatusDetails[0]?.threshold_level !== undefined && (
                      <span className="text-slate-400 font-mono text-[10px]">
                        Sensor threshold: {rvm.binStatusDetails[0].threshold_level}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Hours & Remarks */}
            <div className="space-y-1.5 text-xs text-slate-300 pt-1">
              {rvm.openingHours && (
                <div className="flex items-center gap-2 text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Hours: <span className="text-slate-200 font-medium">{rvm.openingHours}</span></span>
                </div>
              )}
              {rvm.remarks && (
                <div className="flex items-start gap-2 text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                  <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span className="italic">{rvm.remarks}</span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation App Options */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
              Choose Navigation App
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {/* 1. Google Maps */}
              <button
                type="button"
                onClick={() => {
                  launchNavigation('google', links);
                  onClose();
                }}
                className="group flex items-center justify-between p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-750 active:bg-slate-700 border border-slate-700 hover:border-blue-500/50 shadow-md transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  {/* Google Maps Logo Icon */}
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">
                      Google Maps
                    </div>
                    <div className="text-xs text-slate-400">
                      Walking & transit directions, live turn-by-turn
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
              </button>

              {/* 2. Waze */}
              <button
                type="button"
                onClick={() => {
                  launchNavigation('waze', links);
                  onClose();
                }}
                className="group flex items-center justify-between p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-750 active:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 shadow-md transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  {/* Waze Icon */}
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#00D8FF">
                      <circle cx="9" cy="11" r="1.5" fill="#1e293b" />
                      <circle cx="15" cy="11" r="1.5" fill="#1e293b" />
                      <path
                        d="M12 2C6.48 2 2 6.48 2 12c0 1.95.56 3.77 1.53 5.32L2.5 21.5l4.5-.95C8.42 21.49 10.15 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm3.8 13.5c-.5.5-1.3.8-2.3.8s-1.8-.3-2.3-.8c-.3-.3-.3-.8 0-1.1.3-.3.8-.3 1.1 0 .3.3.7.4 1.2.4s.9-.1 1.2-.4c.3-.3.8-.3 1.1 0 .3.3.3.8 0 1.1z"
                        fill="#00D8FF"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                      Waze
                    </div>
                    <div className="text-xs text-slate-400">
                      Real-time traffic alerts, driving route
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
              </button>

              {/* 3. Apple Maps */}
              <button
                type="button"
                onClick={() => {
                  launchNavigation('apple', links);
                  onClose();
                }}
                className="group flex items-center justify-between p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-750 active:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 shadow-md transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  {/* Apple Maps Icon */}
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#34D399">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 2c2.76 0 5 2.24 5 5 0 2.88-2.88 7.19-5 9.88C9.88 16.19 7 11.88 7 9c0-2.76 2.24-5 5-5z" />
                      <circle cx="12" cy="9" r="2.5" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                      Apple Maps
                    </div>
                    <div className="text-xs text-slate-400">
                      Native directions on iPhone, iPad, Mac
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions - with iOS home bar safe area padding */}
        <div className="p-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)] bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyAddress}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Address'}</span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
