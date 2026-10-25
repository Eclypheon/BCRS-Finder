import React, { useState } from 'react';
import { Search, LocateFixed, Loader2, X } from 'lucide-react';
import { UserLocation } from '../types/rvm';

interface SearchBoxProps {
  userLocation: UserLocation | null;
  onSearchPostal: (postal: string) => Promise<void>;
  onGetLiveLocation: () => void;
  isLoadingLocation: boolean;
  isLoadingPostal: boolean;
  errorMessage: string | null;
  onClearError: () => void;
}

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

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-1.5 p-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-md"
      >
        {/* Postal Code Input */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
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
            placeholder="Enter postal code (e.g. 341118)"
            className="w-full pl-8 pr-7 py-2 bg-slate-800/90 border border-slate-700/70 rounded-lg text-slate-100 placeholder-slate-400 text-xs sm:text-sm font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
          />
          {postalInput && (
            <button
              type="button"
              onClick={() => setPostalInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Submit Search Button */}
        <button
          type="submit"
          disabled={isLoadingPostal || !postalInput.trim()}
          title="Search Postal Code"
          className="p-2 sm:px-3 sm:py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 text-white rounded-lg shadow-sm font-semibold text-xs flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
        >
          {isLoadingPostal ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Find</span>
        </button>

        {/* Center on Live Location GPS Button */}
        <button
          type="button"
          onClick={onGetLiveLocation}
          disabled={isLoadingLocation}
          title="Center on Live Location (GPS)"
          className={`p-2 sm:px-3 sm:py-2 rounded-lg border text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
            userLocation?.isLiveGps
              ? 'bg-blue-600/25 text-blue-300 border-blue-500/50 hover:bg-blue-600/35'
              : 'bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 border-slate-700'
          }`}
        >
          {isLoadingLocation ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          ) : (
            <LocateFixed className="w-4 h-4 text-blue-400" />
          )}
          <span className="hidden sm:inline">My Location</span>
        </button>
      </form>

      {/* Inline Error Message */}
      {errorMessage && (
        <div className="mt-1 flex items-center justify-between text-xs text-rose-300 bg-rose-950/70 border border-rose-800/80 rounded-lg px-2.5 py-1">
          <span className="truncate">{errorMessage}</span>
          <button
            type="button"
            onClick={onClearError}
            className="p-0.5 text-rose-400 hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
