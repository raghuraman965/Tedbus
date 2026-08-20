const SavedRoute = require("../models/savedRoute");
const { tReq } = require("../services/i18n");

// ============================================================================
// Google Maps Platform APIs
//   - Google Places API (server-side)     : place search / geocoding
//   - Google Routes API (server-side)     : traffic-aware routing
//
// Falls back to Nominatim + OSRM (free, no keys) when GOOGLE_MAPS_API_KEY
// is not set.
// ============================================================================

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OSRM_BASE = "https://router.project-osrm.org";

const NOMINATIM_USER_AGENT = "TedBusRoutePlanner/1.0 (tedbus route planner demo)";
const OSRM_MAX_WAYPOINTS = 6;

// ---- Simple in-memory cache with TTL -------------------------------
const cache = new Map();
function cached(key, ttlMs, fetcher) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return Promise.resolve({ value: hit.value, cached: true });
  }
  return Promise.resolve()
    .then(fetcher)
    .then((value) => {
      cache.set(key, { value, expires: Date.now() + ttlMs });
      return { value, cached: false };
    });
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expires <= now) cache.delete(key);
  }
}, 5 * 60 * 1000).unref();

// ---- Nominatim politeness: at most 1 request / second --------------
let lastNominatimRequest = 0;
async function throttledFetch(url, options) {
  const wait = Math.max(0, lastNominatimRequest + 1100 - Date.now());
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastNominatimRequest = Date.now();
  return fetch(url, options);
}

// ============================================================================
// Polyline decoder (Google polyline encoding algorithm)
// ============================================================================

function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

// Parse Google duration strings like "3600s" or "1h30m" to minutes.
function parseDuration(dur) {
  if (!dur) return 0;
  if (typeof dur === "number") return dur / 60;
  const s = String(dur);
  if (s.endsWith("s")) return Math.round(parseFloat(s) / 60);
  let minutes = 0;
  const hMatch = s.match(/(\d+)h/);
  const mMatch = s.match(/(\d+)m/);
  if (hMatch) minutes += parseInt(hMatch[1]) * 60;
  if (mMatch) minutes += parseInt(mMatch[1]);
  return minutes || 0;
}

// ============================================================================
// Geocoding / place search
// ============================================================================

exports.searchPlaces = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) {
      return res.status(400).json({ error: tReq(req, "routePlanner.queryRequired") });
    }
    if (q.length > 120) {
      return res.status(400).json({ error: tReq(req, "routePlanner.queryTooLong") });
    }

    // Try Google Places Text Search first, fall back to Nominatim
    if (GOOGLE_API_KEY) {
      try {
        const cacheKey = "gplaces:" + q.toLowerCase();
        const { value, cached: fromCache } = await cached(cacheKey, 24 * 60 * 60 * 1000, async () => {
          const resp = await fetch(PLACES_TEXT_SEARCH_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": GOOGLE_API_KEY,
              "X-Goog-FieldMask": "places.displayName,places.location,places.types,places.formattedAddress,places.primaryType",
            },
            body: JSON.stringify({
              textQuery: q,
              languageCode: "en",
              regionCode: "in",
              maxResultCount: 8,
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (!resp.ok) throw new Error(`Google Places responded with ${resp.status}`);
          const data = await resp.json();
          return (data.places || []).map((p) => ({
            name: p.displayName?.text || q,
            displayName: p.formattedAddress || p.displayName?.text || q,
            lat: p.location?.latitude || 0,
            lon: p.location?.longitude || 0,
            type: p.primaryType || (p.types && p.types[0]) || "place",
          }));
        });
        return res.json({ results: value, cached: fromCache, provider: "google" });
      } catch (err) {
        console.error("[routePlanner] Google Places error, falling back to Nominatim:", err.message);
      }
    }

    // Fallback: Nominatim
    const url = `${NOMINATIM_BASE}/search?format=jsonv2&addressdetails=1&countrycodes=in&limit=8&q=${encodeURIComponent(q)}`;
    const { value, cached: fromCache } = await cached("nom:" + q.toLowerCase(), 24 * 60 * 60 * 1000, async () => {
      const response = await throttledFetch(url, {
        headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Nominatim responded with ${response.status}`);
      const data = await response.json();
      return (data || []).map((p) => ({
        placeId: p.place_id,
        name: p.name || p.display_name || q,
        displayName: p.display_name || q,
        lat: parseFloat(p.lat),
        lon: parseFloat(p.lon),
        type: p.type || "place",
        city: (p.address && (p.address.city || p.address.town || p.address.village || p.address.county)) || "",
        state: (p.address && p.address.state) || "",
        country: (p.address && p.address.country) || "",
      }));
    });
    return res.json({ results: value, cached: fromCache, provider: "nominatim" });
  } catch (error) {
    console.error("[routePlanner] place search error:", error.message);
    return res.status(502).json({ error: tReq(req, "routePlanner.searchUnavailable") });
  }
};

// ============================================================================
// Routing — Google Routes API
// ============================================================================

async function googleRoutesRoute(waypoints, alternatives) {
  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const intermediates = waypoints.slice(1, -1).map((w) => ({
    location: { latLng: { latitude: w.lat, longitude: w.lon } },
  }));

  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lon } } },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    computeAlternativeRoutes: alternatives,
    polylineQuality: "HIGH_QUALITY",
    polylineEncoding: "ENCODED_POLYLINE",
    routeModifiers: { avoidTolls: false, avoidHighways: false, avoidFerries: false },
    languageCode: "en",
    units: "METRIC",
  };
  if (intermediates.length > 0) {
    body.intermediates = intermediates;
  }

  const resp = await fetch(ROUTES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline,routes.description,routes.legs,routes.routeLabels",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Google Routes API responded with ${resp.status}: ${errText}`);
  }
  return resp.json();
}

// ============================================================================
// Routing — OSRM fallback (free, no keys)
// ============================================================================

function toOsrmCoordinates(waypoints) {
  return waypoints.map((w) => `${w.lon},${w.lat}`).join(";");
}

function normalizeCoordinates(geoJsonCoords) {
  return geoJsonCoords.map(([lon, lat]) => [lat, lon]);
}

async function osrmRoute(waypoints, alternatives) {
  const base = `${OSRM_BASE}/route/v1/driving/${toOsrmCoordinates(waypoints)}`;
  const url = `${base}?overview=full&geometries=geojson&alternatives=${alternatives ? "true" : "false"}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`OSRM responded with ${response.status}`);
  const data = await response.json();
  if (data.code !== "Ok") {
    const err = new Error(data.message || `OSRM error: ${data.code}`);
    err.code = data.code;
    throw err;
  }
  return data;
}

async function routeByLegs(waypoints) {
  let distance = 0;
  let duration = 0;
  let coordinates = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const leg = await osrmRoute([waypoints[i], waypoints[i + 1]], false);
    const route = leg.routes[0];
    distance += route.distance;
    duration += route.duration;
    const legCoords = route.geometry.coordinates;
    if (coordinates.length === 0) {
      coordinates = legCoords;
    } else {
      coordinates = coordinates.concat(legCoords.slice(1));
    }
  }
  return {
    routes: [{ distance, duration, geometry: { coordinates, type: "LineString" } }],
    legs: true,
  };
}

// ============================================================================
// Main route calculation endpoint
// ============================================================================

exports.calculateRoute = async (req, res) => {
  try {
    const raw = Array.isArray(req.body.waypoints) ? req.body.waypoints : [];
    const waypoints = raw
      .filter((w) => w && typeof w.lat === "number" && typeof w.lon === "number")
      .map((w) => ({
        lat: Math.round(w.lat * 1e6) / 1e6,
        lon: Math.round(w.lon * 1e6) / 1e6,
        name: String(w.name || "").slice(0, 120),
      }));

    if (waypoints.length < 2) {
      return res.status(400).json({ error: tReq(req, "routePlanner.srcDestRequired") });
    }
    if (waypoints.length > 30) {
      return res.status(400).json({ error: tReq(req, "routePlanner.tooManyStops") });
    }

    // Single-leg routes only use Google Routes API directly
    const useGoogle = GOOGLE_API_KEY && waypoints.length <= 15;
    const key = (useGoogle ? "groute:" : "route:") + JSON.stringify(waypoints.map((w) => [w.lat, w.lon]));

    const { value, cached: fromCache } = await cached(key, 5 * 60 * 1000, async () => {
      if (useGoogle) {
        try {
          const data = await googleRoutesRoute(waypoints, true);
          const routes = (data.routes || []).map((route, index) => {
            const coords = route.polyline?.encodedPolyline ? decodePolyline(route.polyline.encodedPolyline) : [];
            const trafficSec = parseDuration(route.duration);
            const freeFlowSec = parseDuration(route.staticDuration);
            const trafficDelaySec = trafficSec - freeFlowSec;
            const trafficRatio = freeFlowSec > 0 ? trafficSec / freeFlowSec : 1;
            let trafficLevel = "light";
            if (trafficRatio > 1.3) trafficLevel = "heavy";
            else if (trafficRatio > 1.1) trafficLevel = "moderate";

            return {
              index,
              distanceKm: Math.round((route.distanceMeters / 1000) * 10) / 10,
              durationMin: Math.round(freeFlowSec / 60),
              trafficDurationMin: Math.round(trafficSec / 60),
              trafficDelayMin: Math.round(Math.max(0, trafficDelaySec) / 60),
              trafficLevel,
              coordinates: coords,
              description: route.description || "",
              legs: index + 1,
            };
          });

          return { routes, snapped: waypoints.map((w) => ({ name: w.name, lat: w.lat, lon: w.lon })) };
        } catch (err) {
          console.error("[routePlanner] Google Routes API error, falling back to OSRM:", err.message);
        }
      }

      // OSRM fallback
      let osrmResult;
      if (waypoints.length <= OSRM_MAX_WAYPOINTS) {
        try {
          osrmResult = await osrmRoute(waypoints, true);
        } catch (error) {
          if (error.code === "TooBig" || error.code === "InvalidInput") {
            osrmResult = await routeByLegs(waypoints);
          } else {
            throw error;
          }
        }
      } else {
        osrmResult = await routeByLegs(waypoints);
      }

      const routes = (osrmResult.routes || []).map((route, index) => ({
        index,
        distanceKm: Math.round((route.distance / 1000) * 10) / 10,
        durationMin: Math.round(route.duration / 60),
        trafficDurationMin: Math.round(route.duration / 60),
        trafficDelayMin: 0,
        trafficLevel: "estimated",
        coordinates: normalizeCoordinates(route.geometry.coordinates),
        description: "",
        legs: index + 1,
      }));

      const snapped = (osrmResult.waypoints || []).map((w) => ({
        name: w.name || "",
        lat: w.location[1],
        lon: w.location[0],
      }));

      return { routes, snapped };
    });

    return res.json({
      routes: value.routes,
      snapped: value.snapped,
      traffic: useGoogle ? "realtime" : "estimated",
      provider: useGoogle ? "google" : "osrm",
      cached: fromCache,
    });
  } catch (error) {
    console.error("[routePlanner] route calculation error:", error.message);
    return res.status(502).json({ error: tReq(req, "routePlanner.errCalculate") });
  }
};

// ============================================================================
// Saved routes (authenticated)
// ============================================================================

exports.listSavedRoutes = async (req, res) => {
  try {
    const routes = await SavedRoute.find({ userId: req.userId }).sort({ createdAt: -1 }).lean().exec();
    return res.json({ routes });
  } catch (error) {
    console.error("[routePlanner] list saved routes error:", error.message);
    return res.status(500).json({ error: tReq(req, "routePlanner.errSaved") });
  }
};

exports.createSavedRoute = async (req, res) => {
  try {
    const { name, source, destination, waypoints, distanceKm, durationMin, geometry, trafficMode, stops } = req.body;
    if (!source || !destination || typeof distanceKm !== "number" || typeof durationMin !== "number") {
      return res.status(400).json({ error: tReq(req, "routePlanner.saveFields") });
    }
    const route = await SavedRoute.create({
      userId: req.userId,
      name: String(name || "").slice(0, 80),
      source: String(source).slice(0, 120),
      destination: String(destination).slice(0, 120),
      waypoints: Array.isArray(waypoints) ? waypoints.map((w) => ({
        name: String(w.name || "").slice(0, 120),
        lat: Number(w.lat),
        lon: Number(w.lon),
      })) : [],
      distanceKm,
      durationMin,
      geometry: Array.isArray(geometry) ? geometry.slice(0, 20000) : [],
      trafficMode: trafficMode === "realtime" ? "realtime" : "estimated",
      stops: typeof stops === "number" ? stops : (Array.isArray(waypoints) ? waypoints.length : 0),
    });
    return res.status(201).json({ route });
  } catch (error) {
    console.error("[routePlanner] create saved route error:", error.message);
    return res.status(500).json({ error: tReq(req, "routePlanner.errSave") });
  }
};

exports.updateSavedRoute = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, source, destination, waypoints, distanceKm, durationMin, geometry, trafficMode, stops } = req.body;
    const existing = await SavedRoute.findOne({ _id: id, userId: req.userId }).exec();
    if (!existing) {
      return res.status(404).json({ error: tReq(req, "routePlanner.notFound") });
    }
    if (name !== undefined) existing.name = String(name).slice(0, 80);
    if (source !== undefined) existing.source = String(source).slice(0, 120);
    if (destination !== undefined) existing.destination = String(destination).slice(0, 120);
    if (Array.isArray(waypoints)) {
      existing.waypoints = waypoints.map((w) => ({ name: String(w.name || "").slice(0, 120), lat: Number(w.lat), lon: Number(w.lon) }));
    }
    if (typeof distanceKm === "number") existing.distanceKm = distanceKm;
    if (typeof durationMin === "number") existing.durationMin = durationMin;
    if (Array.isArray(geometry)) existing.geometry = geometry.slice(0, 20000);
    if (typeof stops === "number") existing.stops = stops;
    existing.updatedAt = new Date();
    const route = await existing.save();
    return res.json({ route });
  } catch (error) {
    console.error("[routePlanner] update saved route error:", error.message);
    return res.status(500).json({ error: tReq(req, "routePlanner.errUpdate") });
  }
};

exports.deleteSavedRoute = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await SavedRoute.findOneAndDelete({ _id: id, userId: req.userId }).exec();
    if (!deleted) {
      return res.status(404).json({ error: tReq(req, "routePlanner.notFound") });
    }
    return res.json({ message: tReq(req, "routePlanner.deleted") });
  } catch (error) {
    console.error("[routePlanner] delete saved route error:", error.message);
    return res.status(500).json({ error: tReq(req, "routePlanner.errDelete") });
  }
};
