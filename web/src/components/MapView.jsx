import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { useEffect, useMemo } from 'react';
import L from 'leaflet';

const MILES_TO_METRES = 1609.34;

const KIND_COLORS = {
  animal_shelter: '#2f7d4f',
  veterinary: '#2b6cb0',
  animal_boarding: '#b7791f',
};
const DEFAULT_COLOR = '#718096';
const SELECTED_COLOR = '#d64545';

function colorForOrg(org, isSelected) {
  if (isSelected) return SELECTED_COLOR;
  return KIND_COLORS[org.kind] || DEFAULT_COLOR;
}

function makeDivIcon(color, isSelected) {
  const size = isSelected ? 18 : 14;
  return L.divIcon({
    className: 'org-marker',
    html: `<span style="
      display:block;
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:${color};
      border:2px solid white;
      box-shadow:0 0 0 1px rgba(0,0,0,0.25);
    "></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

const KIND_LABELS = {
  animal_shelter: 'Animal shelter',
  veterinary: 'Veterinary',
  animal_boarding: 'Animal boarding',
};

/** Recenters and fits the map bounds whenever the set of orgs changes. */
function FitBounds({ center, orgs, radiusMiles }) {
  const map = useMap();

  useEffect(() => {
    if (!center) return;

    if (orgs && orgs.length > 0) {
      const points = orgs
        .filter((org) => typeof org.lat === 'number' && typeof org.lon === 'number')
        .map((org) => [org.lat, org.lon]);
      points.push([center.lat, center.lon]);
      if (points.length > 1) {
        map.fitBounds(points, { padding: [40, 40] });
        return;
      }
    }

    const radiusMetres = (radiusMiles || 30) * MILES_TO_METRES;
    map.fitBounds(
      L.latLng(center.lat, center.lon).toBounds(radiusMetres * 2),
      { padding: [20, 20] }
    );
  }, [center, orgs, radiusMiles, map]);

  return null;
}

/**
 * Leaflet map with one marker per organization, a search-radius circle,
 * and auto-fit-to-results behavior.
 */
export default function MapView({ center, radiusMiles, organizations, selectedId, onSelect }) {
  const radiusMetres = useMemo(() => (radiusMiles || 0) * MILES_TO_METRES, [radiusMiles]);

  const fallbackCenter = { lat: 37.7749, lon: -122.4194 }; // San Francisco
  const mapCenter = center || fallbackCenter;

  return (
    <MapContainer
      center={[mapCenter.lat, mapCenter.lon]}
      zoom={11}
      className="map-view__container"
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />

      {center ? (
        <Circle
          center={[center.lat, center.lon]}
          radius={radiusMetres}
          pathOptions={{ color: '#4c6ef5', weight: 1, fillOpacity: 0.05 }}
        />
      ) : null}

      {organizations
        .filter((org) => typeof org.lat === 'number' && typeof org.lon === 'number')
        .map((org) => {
          const isSelected = org.id === selectedId;
          return (
            <Marker
              key={org.id}
              position={[org.lat, org.lon]}
              icon={makeDivIcon(colorForOrg(org, isSelected), isSelected)}
              eventHandlers={{ click: () => onSelect && onSelect(org.id) }}
            >
              <Popup>
                <div className="map-popup">
                  <p className="map-popup__name">{org.name || 'Unnamed organization'}</p>
                  <p className="map-popup__meta">
                    {KIND_LABELS[org.kind] || org.kind || 'Unknown type'}
                    {typeof org.distanceMiles === 'number'
                      ? ` · ${org.distanceMiles.toFixed(1)} mi`
                      : ''}
                  </p>
                  {org.address?.full ? (
                    <p className="map-popup__address">{org.address.full}</p>
                  ) : null}
                  {org.website ? (
                    <a href={org.website} target="_blank" rel="noreferrer">
                      Visit website
                    </a>
                  ) : null}
                  {org.isSynthetic ? <p className="map-popup__synthetic">Synthetic record</p> : null}
                </div>
              </Popup>
            </Marker>
          );
        })}

      <FitBounds center={center} orgs={organizations} radiusMiles={radiusMiles} />
    </MapContainer>
  );
}
