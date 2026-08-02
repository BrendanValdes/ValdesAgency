/**
 * Assessment-side calibration surface.
 *
 * Bounded canaries import calibration through this module rather than reaching
 * into lead-engine/qualification directly, which the offline-orchestration
 * containment boundary forbids for production surfaces including scripts.
 */
export {
  calibrateServiceLanguage,
  evaluateServiceLanguage,
  CANDIDATE_SERVICE_LANGUAGE_RULES,
  MINIMUM_INDEPENDENT_SITES,
  SERVICE_LANGUAGE_RULESET_VERSION,
  type CalibratedRule,
  type ServiceLanguageCalibration,
} from "../qualification/service-language.js";
export {
  IDENTITY_CORROBORATION_VERSION,
  MINIMUM_COMPATIBLE_DIMENSIONS,
} from "../identity/corroboration.js";
