import React, { useState } from 'react';
import { Search, MapPin, Navigation, Loader2, X, Sparkles } from 'lucide-react';
import { UserLocation } from '../types/rvm';

interface SearchBoxProps {
  userLocation: UserLocation | null;
  onSearchPostal: (postal: string) => Promise<void>;
  onGetLiveLocation: () => Promise<void>;
  isLoadingLocation: boolean;
  isLoadingPostal: boolean;
  errorMessage: string | null;
  onClearError: () => void;
}

const PRESET_LOCATIONS = [
  { name: 'Bidadari', postal: '341118' },
  { name: 'Tampines', postal: '520475' },
  { name: 'Orchard', postal: '238872' },
  { name: 'Jurong East', postal: '609601' },
  { name: 'Woodlands', postal: '730818' },
];

export const SearchBox: React.FC<SearchBoxProps> = ({
  userLocation,
  onSearchPostal,
  onGetLiveLocation,
  isLoadingLocation,
  isLoadingPostal,
  errorMessage,
  onClearError,
}) => {
  const [postalInput, setPostalInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (postalInput.trim()) {
      onSearchPostal(postalInput.trim());
    }
  };

  const handlePreset = (postal: string) => {
    setPostalInput(postal);
    onSearchPostal(postal);
  };

  return (
    <div className="w-full bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl shadow-black/40">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        {/* Postal Code Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={postalInput}
            onChange={(e) => {
              setPostalInput(e.target.value);
              if (errorMessage) onClearError();
            }}
            placeholder="Enter 6-digit postal code (e.g. 341118)"
            className="w-full pl-10 pr-9 py-2.5 bg-slate-800/90 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
          />
          {postalInput && (
            <button
              type="button"
              onClick={() => setPostalInput('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Buttons Group */}
        <div className="flex gap-2">
          {/* Search Button */}
          <button
            type="submit"
            disabled={isLoadingPostal || !postalInput.trim()}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
          >
            {isLoadingPostal ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>Find</span>
          </button>

          {/* Live Location GPS Button */}
          <button
            type="button"
            onClick={onGetLiveLocation}
            disabled={isLoadingLocation}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold rounded-xl border transition-all cursor-pointer ${
              userLocation?.isLiveGps
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 hover:bg-blue-600/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-slate-600 active:bg-slate-900'
            }`}
            title="Use current GPS location"
          >
            {isLoadingLocation ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            ) : (
              <Navigation
                className={`w-4 h-4 ${
                  userLocation?.isLiveGps ? 'text-blue-400 fill-blue-400/30' : 'text-slate-300'
                }`}
              />
            )}
            <span className="hidden xs:inline">Live GPS</span>
          </button>
        </div>
      </form>

      {/* Error Message */}
      {errorMessage && (
        <div className="mt-2.5 flex items-center justify-between text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-lg px-3 py-1.5">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={onClearError}
            className="text-rose-400 hover:text-rose-200 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Location Status Badge & Quick Preset Chips */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs">
        <div className="flex items-center gap-1.5 min-w-0 text-slate-300">
          <MapPin
            className={`w-3.5 h-3.5 shrink-0 ${
              userLocation?.isLiveGps ? 'text-blue-400' : 'text-emerald-400'
            }`}
          />
          <span className="truncate font-medium text-slate-200">
            {userLocation ? (
              <>
                <span className="text-slate-400">Centered at: </span>
                <span className="text-white font-semibold">
                  {userLocation.label || userLocation.postalCode || 'Current Position'}
                </span>
                {userLocation.postalCode && (
                  <span className="ml-1 text-slate-400 font-mono">({userLocation.postalCode})</span>
                )}
              </>
            ) : (
              'Locating your position...'
            )}
          </span>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[11px] text-slate-500 font-medium shrink-0 flex items-center gap-0.5">
            <Sparkles className="w-3 h-3 text-amber-400" /> Quick:
          </span>
          {PRESET_LOCATIONS.map((preset) => (
            <button
              key={preset.postal}
              type="button"
              onClick={() => handlePreset(preset.postal)}
              className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-colors text-[11px] shrink-0 cursor-pointer"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
