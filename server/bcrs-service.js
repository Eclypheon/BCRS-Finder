// Service to communicate with bts.bcrs.sg and handle token caching,
// upstream retry, and fallback to seed data.

const fs = require('fs');
const path = require('path');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'x-bcrs-client': 'web',
  'Referer': 'https://bts.bcrs.sg/14f3d8bb-83ae-63a28c5b8631/public-rvm-map',
  'Accept': 'application/json'
};

const SEED_PATH = path.join(__dirname, '../src/data/seed-rvms.json');

class BcrsService {
  constructor() {
    this.mapUuid = null;
    this.mapUuidExpiry = 0;
    this.accessToken = null;
    this.accessTokenExpiry = 0;

    this.cachedLocations = null;
    this.locationsCacheExpiry = 0;

    this.binStatusCache = new Map(); // rvmId -> { data, expiry }
  }

  // Load fallback seed data if available
  getSeedData() {
    try {
      if (fs.existsSync(SEED_PATH)) {
        const raw = fs.readFileSync(SEED_PATH, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Error reading seed data:', e);
    }
    return [];
  }

  async getMapUuid() {
    const now = Date.now();
    if (this.mapUuid && this.mapUuidExpiry > now + 10000) {
      return this.mapUuid;
    }

    try {
      const res = await fetch('https://bts.bcrs.sg/ab0capi/v10/map-token', { headers: HEADERS });
      if (!res.ok) throw new Error(`map-token HTTP ${res.status}`);
      const json = await res.json();
      const uuid = json?.data?.uuid;
      const expiresInSec = json?.data?.expiresIn || 60;
      if (!uuid) throw new Error('No uuid in map-token response');

      this.mapUuid = uuid;
      this.mapUuidExpiry = now + (expiresInSec * 1000);
      return this.mapUuid;
    } catch (err) {
      console.warn('Failed to obtain map-token UUID:', err.message);
      if (this.mapUuid) return this.mapUuid; // stale fallback
      throw err;
    }
  }

  async getAccessToken() {
    const now = Date.now();
    if (this.accessToken && this.accessTokenExpiry > now + 15000) {
      return this.accessToken;
    }

    const uuid = await this.getMapUuid();
    try {
      const url = `https://bts.bcrs.sg/ab0capi/v10/${uuid}/locations/access-token`;
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`access-token HTTP ${res.status}`);
      const json = await res.json();
      const token = json?.data?.token;
      let expiresAt = json?.data?.expiresAt;

      if (!token) throw new Error('No token in access-token response');

      let expMs = now + 3600000;
      if (typeof expiresAt === 'number') {
        expMs = expiresAt > 1e11 ? expiresAt : expiresAt * 1000;
      }

      this.accessToken = token;
      this.accessTokenExpiry = expMs;
      return this.accessToken;
    } catch (err) {
      console.warn('Failed to obtain access-token:', err.message);
      if (this.accessToken) return this.accessToken;
      throw err;
    }
  }

  async getLocations(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cachedLocations && this.locationsCacheExpiry > now) {
      return this.cachedLocations;
    }

    try {
      const uuid = await this.getMapUuid();
      const token = await this.getAccessToken();

      const url = `https://bts.bcrs.sg/ab0capi/v10/${uuid}/locations`;
      const res = await fetch(url, {
        headers: {
          ...HEADERS,
          'x-bcrs-map-token': token,
          'Cache-Control': 'no-cache'
        }
      });

      if (!res.ok) throw new Error(`locations HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json?.data)) throw new Error('Invalid data payload');

      const cleaned = [];
      for (const item of json.data) {
        const lat = parseFloat(item.latitude);
        const lng = parseFloat(item.longitude);
        if (isNaN(lat) || isNaN(lng) || lat < 1.15 || lat > 1.49 || lng < 103.55 || lng > 104.1) {
          continue;
        }

        const postal = (item.postalCode || '').trim();
        let locationName = (item.locationName || '').trim();
        const address = (item.address || '').trim();

        if (!locationName && address) {
          locationName = address.split(',')[0];
        }
        if (!locationName) {
          locationName = `BCRS RVM #${item.id}`;
        }

        const rawStatus = (item.status || 'UNKNOWN').trim().toUpperCase();
        let status = 'RUNNING';
        if (['FULL'].includes(rawStatus)) {
          status = 'FULL';
        } else if (['OFFLINE', 'CLEANING', 'SUSPENDED', 'MAINTENANCE', 'ERROR', 'UNKNOWN'].includes(rawStatus)) {
          status = rawStatus;
        } else {
          status = 'RUNNING';
        }

        cleaned.push({
          id: item.id,
          serialNumber: item.serialNumber || '',
          locationName,
          address,
          postalCode: postal,
          latitude: lat,
          longitude: lng,
          status,
          rawStatus,
          coordsColor: item.coords_color || 'Blue',
          openingHours: item.rvmOpeningHours || 'Mon - Sun: 24 Hrs',
          remarks: item.rvm_remarks || '',
          updated_at: item.updated_at || item.updatedAt || new Date().toISOString()
        });
      }

      this.cachedLocations = cleaned;
      this.locationsCacheExpiry = now + 60000; // 60s cache
      return cleaned;
    } catch (err) {
      console.warn('Error fetching live locations from upstream, using seed fallback:', err.message);
      if (this.cachedLocations && this.cachedLocations.length > 0) {
        return this.cachedLocations;
      }
      return this.getSeedData();
    }
  }

  async getBinStatus(rvmId) {
    const id = parseInt(rvmId, 10);
    if (!id) return null;

    const now = Date.now();
    const cached = this.binStatusCache.get(id);
    if (cached && cached.expiry > now) {
      return cached.data;
    }

    try {
      const uuid = await this.getMapUuid();
      const token = await this.getAccessToken();

      const url = `https://bts.bcrs.sg/ab0capi/v10/${uuid}/locations/rvms/${id}/bin-status`;
      const res = await fetch(url, {
        headers: {
          ...HEADERS,
          'x-bcrs-map-token': token,
          'Cache-Control': 'no-cache'
        }
      });

      if (!res.ok) throw new Error(`bin-status HTTP ${res.status}`);
      const json = await res.json();
      const data = Array.isArray(json?.data) ? json.data : [];

      this.binStatusCache.set(id, {
        data,
        expiry: now + 30000 // 30s cache
      });

      return data;
    } catch (err) {
      console.warn(`Failed to fetch bin status for RVM ${id}:`, err.message);
      return cached ? cached.data : [];
    }
  }
}

module.exports = new BcrsService();
