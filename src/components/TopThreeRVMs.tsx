import React from 'react';
import { RVM } from '../types/rvm';
import { formatDistance, getMachineStatusInfo } from '../utils/geo';
import { Navigation, Compass, ChevronRight, Gauge } from 'lucide-react';

interface TopThreeRVMsProps {
  nearestRVMs: RVM[];
  onSelectRVM: (rvm: RVM) => void;
  onFocusRVMOnMap: (rvm: RVM) => void;
}

export const TopThreeRVMs: React.FC<TopThreeRVMsProps> = ({
  nearestRVMs,
  onSelectRVM,
  onFocusRVMOnMap,
}) => {
  if (!nearestRVMs || nearestRVMs.length === 0) {
    return (
      <div className="w-full bg-slate-900/90 border border-slate-800/80 rounded-xl p-3 text-center text-xs text-slate-400">
        Calculating nearest BCRS machines...
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between px-1 mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
          Top 3 Nearest Machines
        </span>
        <span className="text-[11px] text-slate-500 font-normal">
          Tap name or card to navigate
        </span>
      </div>

      {/* Grid of 3 compact cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {nearestRVMs.slice(0, 3).map((rvm, index) => {
          const statusInfo = getMachineStatusInfo(rvm);
          const distanceStr = formatDistance(rvm.distanceMeters);

          return (
            <div
              key={rvm.id}
              onClick={() => onSelectRVM(rvm)}
              className="group relative flex items-center justify-between p-2.5 sm:p-3 bg-slate-900/95 hover:bg-slate-800/95 active:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 rounded-xl shadow-md transition-all duration-150 cursor-pointer overflow-hidden"
            >
              {/* Left Rank Accent */}
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-slate-800 group-hover:bg-emerald-950/70 text-slate-300 group-hover:text-emerald-400 border border-slate-700/60 group-hover:border-emerald-500/40 text-xs font-black shrink-0 transition-colors">
                  #{index + 1}
                </div>

                <div className="min-w-0 flex-1">
                  {/* Location Name */}
                  <h4 className="text-xs sm:text-sm font-bold text-slate-100 group-hover:text-emerald-300 truncate transition-colors">
                    {rvm.locationName}
                  </h4>

                  {/* Distance & Status Sub-line */}
                  <div className="flex items-center gap-2 mt-0.5 text-xs">
                    <span className="font-semibold text-emerald-400 shrink-0">
                      {distanceStr}
                    </span>

                    <span className="text-slate-600">•</span>

                    {/* Status Badge */}
                    <div
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-medium leading-none shrink-0 ${statusInfo.bgClass}`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: statusInfo.hex }}
                      />
                      <span>{statusInfo.label}</span>
                    </div>

                    {/* Live bin gauge if available */}
                    {rvm.binFillPct !== undefined && rvm.binFillPct !== null && (
                      <span className="hidden sm:inline-flex items-center gap-0.5 text-[11px] text-slate-400 shrink-0">
                        <Gauge className="w-3 h-3 text-slate-500" />
                        {rvm.binFillPct}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusRVMOnMap(rvm);
                  }}
                  title="Focus on Map"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/70 border border-transparent hover:border-slate-600 transition-colors cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRVM(rvm);
                  }}
                  title="Navigate"
                  className="p-1.5 rounded-lg bg-emerald-600/20 group-hover:bg-emerald-600 text-emerald-400 group-hover:text-white border border-emerald-500/30 group-hover:border-emerald-500 transition-all cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                </button>

                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors hidden sm:block" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
