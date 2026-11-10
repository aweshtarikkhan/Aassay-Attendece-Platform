export interface GeoLocationResult {
  lat: number | null;
  lng: number | null;
  address: string;
  accuracy?: number | null;
  source: 'gps' | 'wifi' | 'fallback';
}

/**
 * Validates if coordinates lie within Indian geographical boundaries.
 * Latitude: 6.0° N to 37.5° N
 * Longitude: 68.0° E to 97.5° E
 * Prevents erroneous ISP IP hops (Russia, Morocco, Seychelles, Europe).
 */
export function isInsideIndia(lat: number, lng: number): boolean {
  return lat >= 6.0 && lat <= 37.5 && lng >= 68.0 && lng <= 97.5;
}

/**
 * Detect whether current client is running on a Laptop or Desktop PC.
 */
export function isLaptopOrDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  return !isMobileUA;
}

/**
 * Check browser location permission state.
 */
export async function checkLocationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
    try {
      const res = await navigator.permissions.query({ name: 'geolocation' });
      return res.state;
    } catch {
      return 'prompt';
    }
  }
  return 'prompt';
}

/**
 * Reverse geocode coordinates using 100% Free, No-Key APIs:
 * 1. BigDataCloud Client Reverse Geocoding (Free, instant, CORS-friendly, accurate Indian localities & pincodes)
 * 2. OpenStreetMap (OSM) Nominatim (Free, open-source global road & landmark database)
 *
 * ZERO Google Maps API key required — zero billing, zero quota blockade.
 */
export async function reverseGeocodeFree(lat: number, lng: number): Promise<string> {
  let address = '';

  // Step 1: BigDataCloud Client API (100% Free, no API key needed, highly accurate for Indian addresses)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const parts = [
        data.locality || data.localityInfo?.administrative?.[3]?.name,
        data.city || data.localityInfo?.administrative?.[2]?.name,
        data.principalSubdivision || data.localityInfo?.administrative?.[1]?.name,
        data.postcode,
        data.countryName,
      ].filter(Boolean);

      if (parts.length > 0) {
        address = Array.from(new Set(parts)).join(', ');
      }
    }
  } catch (e) {
    console.warn('BigDataCloud reverse geocode error:', e);
  }

  // Step 2: OpenStreetMap Nominatim Fallback (100% Free open-source map community)
  if (!address) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        {
          signal: controller.signal,
          headers: { 'Accept-Language': 'en' },
        }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data?.display_name) {
          address = data.display_name;
        }
      }
    } catch (e) {
      console.warn('Nominatim reverse geocode error:', e);
    }
  }

  return address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/**
 * Capture accurate pin-point location for attendance.
 *
 * 1. Mobile Phone (Satellite GPS Hardware):
 *    Requests high-accuracy satellite GPS coordinates directly from the phone's GPS sensor.
 * 2. Strict India Boundary Validation:
 *    Automatically rejects any foreign coordinates (Russia, Morocco, etc.) caused by ISP IP reallocation.
 * 3. 100% Free Reverse Geocoding:
 *    Uses BigDataCloud & OpenStreetMap Nominatim with ZERO API keys and zero cost.
 */
export async function captureAccurateLocation(): Promise<GeoLocationResult> {
  let coords: { lat: number; lng: number; accuracy: number } | null = null;
  let detectedSource: 'gps' | 'wifi' | 'fallback' = 'fallback';

  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    // Attempt 1: High Accuracy (Direct satellite GPS on Mobile, precise WiFi on Laptops)
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0, // Fresh fix only, no stale cache
        });
      });

      coords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy || 9999,
      };
      // On mobile devices with GPS, accuracy is typically <= 25 meters
      detectedSource = pos.coords.accuracy && pos.coords.accuracy <= 50 ? 'gps' : 'wifi';
    } catch (err: any) {
      console.warn('High accuracy geolocation failed, attempting standard triangulation:', err?.message);

      // Attempt 2: Standard Accuracy (WiFi triangulation)
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 6000,
            maximumAge: 30000,
          });
        });

        coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 9999,
        };
        detectedSource = 'wifi';
      } catch (err2: any) {
        console.warn('Standard geolocation also unavailable:', err2?.message);
        coords = null;
      }
    }
  }

  // Strict India Boundary Sanity Check:
  // Foreign coordinates (e.g. Russia lat 55°, Morocco lat 31° lng -7°) from outdated ISP IP pools are strictly rejected!
  if (coords && !isInsideIndia(coords.lat, coords.lng)) {
    console.warn(`Erroneous foreign coordinates rejected [${coords.lat}, ${coords.lng}]. Discarding to prevent Russia/Morocco false readings.`);
    coords = null;
  }

  // If real device coordinates were obtained and verified inside India:
  if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
    const lat = coords.lat;
    const lng = coords.lng;
    const accuracy = Math.round(coords.accuracy);

    // Free Reverse Geocoding (BigDataCloud + OpenStreetMap)
    const address = await reverseGeocodeFree(lat, lng);

    // Format human-friendly accuracy badge
    const accuracyTag = accuracy <= 15 ? 'Pinpoint'
                      : accuracy <= 50 ? 'Precise'
                      : accuracy <= 200 ? 'Approximate'
                      : 'Broad';
    const formattedAddress = `${address} [${accuracyTag} ~${accuracy}m]`;

    return {
      lat,
      lng,
      address: formattedAddress,
      accuracy,
      source: detectedSource,
    };
  }

  // Clean fallback when device location is not available or denied
  return {
    lat: null,
    lng: null,
    address: 'Workplace Device / Web Check-In (Location Sensor Unavailable)',
    accuracy: null,
    source: 'fallback',
  };
}
