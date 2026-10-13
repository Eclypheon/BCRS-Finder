# ♻️ BCRS Finder

> **PWA to find your nearest Beverage Container Return Scheme (BCRS) reverse vending machines in Singapore, check live bin capacity status, and launch 1-tap navigation via Google Maps, Waze, or Apple Maps.**

Inspired by and building upon [TheDJVG/BCRSTracking](https://github.com/TheDJVG/BCRSTracking).

---

## 🚀 Key Features

* **📍 Smart Location Finder**:
  * **6-Digit Singapore Postal Code Search**: Powered by Singapore Land Authority's official OneMap search API (e.g. `341118`, `520475`, `238872`).
  * **1-Tap Live GPS**: Instantly retrieves your current geolocation using HTML5 Geolocation with high accuracy.
  * **Quick SG Presets**: One-click shortcuts for major hubs (Bidadari, Tampines, Orchard, Jurong East, Woodlands).

* **🥇 Top 3 Nearest Machines**:
  * Displayed in an ultra-compact, high-density layout at the top of the screen.
  * Shows **Location Name**, **Distance from you** (Haversine formula), and **Real-Time Status**.
  * Shows live bin capacity percentage (`20%`, `75%`, `90%`).
  * Tap any card or machine name to immediately open the Navigation modal.

* **🗺️ Interactive Map (All 1,420+ BCRS Machines)**:
  * Centered on your current location with an animated pulsing blue dot.
  * Hardware-accelerated Canvas rendering for smooth 60 FPS interactions across all Singapore machines.
  * **Color-Coded Status Dots**:
    * 🟢 **Green**: **In Operation** (Normal capacity, accepting cans & bottles)
    * 🟡 **Yellow**: **Filling Fast** (>70% bin capacity threshold)
    * 🔴 **Red**: **Bin Full** (Reached 100% capacity)
    * ⚪ **Gray**: **Offline / Maintenance**
  * One-touch Status Filter pills (`All`, `In Operation`, `Filling Fast`, `Bin Full`).
  * Floating **Recenter** button and Map Style switcher (Voyager / Dark mode).

* **🧭 1-Tap Navigation Modal**:
  * Tap any machine name or map dot to launch the navigation modal.
  * Deep links and universal links directly to:
    * 🗺️ **Google Maps** (Walking & Transit directions)
    * 🚗 **Waze** (`waze://` deep link with real-time routing)
    * 🍏 **Apple Maps** (`maps://` native directions on iOS and macOS)
  * Includes address copy, native sharing, operating hours, and location remarks.

* **📱 Progressive Web App (PWA)**:
  * Installable as a standalone app on iOS (Add to Home Screen), Android, and Desktop Chrome.
  * Pre-cached offline seed dataset containing all 1,420 Singapore BCRS machines.
  * Instant startup even in low-connectivity underground areas.

---

## 🏗️ Architecture & Upstream API Integration

```
                         ┌─────────────────────────────────┐
                         │   Upstream BCRS SG Portal       │
                         │      (bts.bcrs.sg/ab0capi)      │
                         └──────────────┬──────────────────┘
                                        │
                         1. GET /map-token (UUID, 60s)
                         2. GET /{uuid}/locations/access-token
                         3. GET /{uuid}/locations
                         4. GET /{uuid}/locations/rvms/{id}/bin-status
                                        ▼
                         ┌─────────────────────────────────┐
                         │       BCRS Finder Backend       │
                         │   (Express Caching API Proxy)   │
                         │                                 │
                         │  • /api/rvms (60s TTL)          │
                         │  • /api/rvms/:id/bin-status     │
                         │  • /api/geocode (OneMap proxy)  │
                         │  • Bundled fallback seed        │
                         └──────────────┬──────────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────────┐
                         │       BCRS Finder Frontend      │
                         │     (React + Vite + Leaflet)    │
                         │                                 │
                         │  • Top Search Box (Postal/GPS)  │
                         │  • Top 3 Compact Cards          │
                         │  • Interactive Canvas Map       │
                         │  • Navigation Deep Link Modal   │
                         └─────────────────────────────────┘
```

---

## 🛠️ Getting Started

### Prerequisites

* **Node.js**: v18.0.0 or later (v20+ recommended)
* **npm**: v9.0.0 or later

### Installation

```bash
git clone https://github.com/Eclypheon/BCRS-Finder.git
cd BCRS-Finder
npm install
```

### Development Mode

Run the backend proxy server and the Vite dev server:

```bash
# Terminal 1: Start backend proxy
npm run server

# Terminal 2: Start Vite frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

```bash
# Build frontend with PWA service worker
npm run build

# Start production server
npm start
```

The production app will run on [http://localhost:3001](http://localhost:3001).

### Update Seed Data

To fetch the latest Singapore BCRS machine snapshot from upstream:

```bash
npm run fetch-seed
```

---

## 🌐 Deep Linking Details

| Platform | Web Universal Link | Native App Deep Link Scheme |
| :--- | :--- | :--- |
| **Google Maps** | `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=walking` | `google.navigation:q={lat},{lng}&mode=w` |
| **Waze** | `https://waze.com/ul?ll={lat},{lng}&navigate=yes` | `waze://?ll={lat},{lng}&navigate=yes` |
| **Apple Maps** | `https://maps.apple.com/?daddr={lat},{lng}&dirflg=w` | `maps://?daddr={lat},{lng}&dirflg=w` |

---

## 📜 License

MIT License. Upstream machine data is provided by Singapore's Beverage Container Return Scheme (`bts.bcrs.sg`).
