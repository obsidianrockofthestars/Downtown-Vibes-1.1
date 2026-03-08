import { haversineDistance } from './haversine';

describe('haversineDistance', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistance(39.7684, -94.8466, 39.7684, -94.8466)).toBe(0);
  });

  it('calculates NYC to LA as approximately 2446 miles', () => {
    const nyc = { lat: 40.7128, lon: -74.006 };
    const la = { lat: 34.0522, lon: -118.2437 };

    const distance = haversineDistance(nyc.lat, nyc.lon, la.lat, la.lon);

    expect(distance).toBeCloseTo(2446, 0);
  });
});
