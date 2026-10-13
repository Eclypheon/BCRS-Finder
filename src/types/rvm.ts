export type RvmStatusCategory = 'RUNNING' | 'FILLING_FAST' | 'FULL' | 'OFFLINE';

export interface RVM {
  id: number;
  serialNumber: string;
  locationName: string;
  address: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  status: string; // RUNNING, FULL, ERROR, OFFLINE, MAINTENANCE, CLEANING
  rawStatus: string;
  coordsColor?: string; // Blue, Red, Green
  openingHours?: string;
  remarks?: string;
  distanceMeters?: number;
  binFillPct?: number | null;
  binStatusDetails?: BinStatusItem[];
}

export interface BinStatusItem {
  compartment_type: string;
  threshold_level: number;
  last_updated?: string;
  capacity?: number;
  current_count?: number;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  label?: string;
  address?: string;
  postalCode?: string;
  isLiveGps: boolean;
  accuracy?: number;
}

export interface StatusStyleInfo {
  category: RvmStatusCategory;
  label: string;
  colorName: 'green' | 'yellow' | 'red' | 'gray';
  hex: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  ringClass: string;
  dotClass: string;
}

export type FilterOption = 'ALL' | 'RUNNING' | 'FILLING_FAST' | 'FULL' | 'OFFLINE';
