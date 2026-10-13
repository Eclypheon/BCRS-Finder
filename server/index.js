const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrsService = require('./bcrs-service');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API: Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API: Get all BCRS RVMs
app.get('/api/rvms', async (req, res) => {
  try {
    const refresh = req.query.refresh === 'true';
    const locations = await bcrsService.getLocations(refresh);
    res.json({
      status: 'ok',
      count: locations.length,
      data: locations
    });
  } catch (err) {
    console.error('Error in /api/rvms:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// API: Get bin status for a specific RVM
app.get('/api/rvms/:id/bin-status', async (req, res) => {
  try {
    const rvmId = req.params.id;
    const data = await bcrsService.getBinStatus(rvmId);
    res.json({
      status: 'ok',
      rvmId: Number(rvmId),
      data
    });
  } catch (err) {
    console.error(`Error in /api/rvms/${req.params.id}/bin-status:`, err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// API: Geocode postal code using OneMap Singapore
app.get('/api/geocode', async (req, res) => {
  const postal = (req.query.postal || '').trim();
  if (!postal) {
    return res.status(400).json({ status: 'error', message: 'postal query param required' });
  }

  try {
    const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(postal)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OneMap HTTP ${response.status}`);
    }
    const json = await response.json();
    if (json && json.results && json.results.length > 0) {
      const best = json.results[0];
      return res.json({
        status: 'ok',
        found: true,
        data: {
          address: best.ADDRESS || best.SEARCHVAL,
          building: best.BUILDING,
          road: best.ROAD_NAME,
          block: best.BLK_NO,
          postal: best.POSTAL,
          latitude: parseFloat(best.LATITUDE),
          longitude: parseFloat(best.LONGITUDE)
        }
      });
    }

    // Fallback: check against known RVM postal codes
    const locations = await bcrsService.getLocations();
    const match = locations.find(l => l.postalCode === postal);
    if (match) {
      return res.json({
        status: 'ok',
        found: true,
        data: {
          address: match.address || match.locationName,
          building: match.locationName,
          postal: match.postalCode,
          latitude: match.latitude,
          longitude: match.longitude
        }
      });
    }

    res.json({ status: 'ok', found: false, message: 'No location found for this postal code' });
  } catch (err) {
    console.error('Error in /api/geocode:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Serve frontend in production
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexFile = path.join(distPath, 'index.html');
  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }
  next();
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`BCRS Finder Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
