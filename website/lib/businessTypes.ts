/**
 * The 9 business types displayed in Section 2 (Who It's For).
 *
 * Per Path A in Gate A: "local service businesses" frames all 9 honestly.
 * Order matches the copy draft. Icons from lucide-react.
 *
 * PHASE 1 REVERT: holding Brendan's Round 2 icon swaps (Waves/Warehouse/
 * Wrench) until Phase 1 snap verification passes. Will re-apply in Phase 2.
 */

import {
  Droplets,
  Bug,
  Wind,
  Trees,
  DoorClosed,
  UtensilsCrossed,
  Sparkles,
  Home,
  Car,
  type LucideIcon,
} from "lucide-react";

export interface BusinessType {
  id: string;
  label: string;
  Icon: LucideIcon;
}

export const BUSINESS_TYPES: BusinessType[] = [
  { id: "pool", label: "Pool Service", Icon: Droplets },
  { id: "pest", label: "Pest Control", Icon: Bug },
  { id: "hvac", label: "HVAC", Icon: Wind },
  { id: "landscaping", label: "Landscaping", Icon: Trees },
  { id: "garage", label: "Garage Door", Icon: DoorClosed },
  { id: "restaurants", label: "Restaurants", Icon: UtensilsCrossed },
  { id: "medspa", label: "Med Spa", Icon: Sparkles },
  { id: "realestate", label: "Real Estate", Icon: Home },
  { id: "auto", label: "Auto Service", Icon: Car },
];
