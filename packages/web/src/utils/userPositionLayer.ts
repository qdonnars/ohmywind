import L from "leaflet";
import type { UserPosition } from "../hooks/useGeolocation";
import { shouldDrawAccuracy } from "./accuracy";

/**
 * Idempotently reflect `position` onto the map as a blue dot plus an
 * accuracy halo. Passing null removes the layer. Shared by the explore and
 * planner maps so the "you are here" marker looks the same in both.
 */
export function syncUserPositionLayer(
  map: L.Map,
  layerRef: { current: L.LayerGroup | null },
  position: UserPosition | null,
): void {
  if (!position) {
    layerRef.current?.remove();
    layerRef.current = null;
    return;
  }

  const latlng: [number, number] = [position.lat, position.lon];
  layerRef.current?.remove();

  const group = L.layerGroup();
  if (shouldDrawAccuracy(position.accuracyM)) {
    L.circle(latlng, {
      radius: position.accuracyM,
      color: "#3b82f6",
      weight: 1,
      opacity: 0.5,
      fillColor: "#3b82f6",
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(group);
  }
  L.circleMarker(latlng, {
    radius: 6,
    color: "#ffffff",
    weight: 2,
    fillColor: "#3b82f6",
    fillOpacity: 1,
    interactive: false,
  }).addTo(group);

  group.addTo(map);
  layerRef.current = group;
}
