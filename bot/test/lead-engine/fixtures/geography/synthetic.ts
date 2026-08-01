import type { GeographyTarget } from "../../../../src/lead-engine/geography/types.js";

export const synthetic_fixture = true;

export const syntheticMetro: GeographyTarget = {
  level: "metro",
  label: "Synthetic Phoenix Metro",
  countryCode: "US",
  subdivisionCode: "US-AZ",
  bounds: { west: -113, south: 32, east: -111, north: 34 },
  density: "dense",
};

export const syntheticRuralCounty: GeographyTarget = {
  level: "county",
  label: "Synthetic Rural County",
  countryCode: "US",
  subdivisionCode: "US-NV",
  bounds: { west: -118, south: 38, east: -116, north: 40 },
  density: "rural",
};
