import { isCurrentExternalVerification } from "../domain/provenance.js";
import { stableHash, stableId } from "../shared/stable.js";
import { POOL_SERVICE_ICP_MODEL_VERSION } from "./pool-service-model.js";
import {
  qualificationModelForVersion,
  type QualificationModel,
} from "./qualification-model.js";
import {
  ICP_SCORE_COMPONENTS,
  type IcpPriorityTier,
  type IcpQualificationResult,
  type IcpScoreComponent,
  type PoolServiceQualificationInput,
  type PoolServiceQualificationResult,
  type QualificationComponentScore,
  type QualificationEvidenceReference,
  type QualificationFact,
  type QualificationFactState,
  type QualificationHardDisqualifier,
  type QualificationRuleOutcome,
  type QualificationSignal,
} from "./types.js";

function canonicalIso(name: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${name} must be a canonical ISO timestamp`);
  }
  return parsed;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().replace(/[_\s]+/g, " ").toLocaleLowerCase("en-US");
}

function includesTerm(value: string | null, terms: ReadonlyArray<string>): boolean {
  if (!value) return false;
  const candidate = normalized(value);
  return terms.some((term) => candidate.includes(normalized(term)));
}

function referenceKey(reference: QualificationEvidenceReference): string {
  return `${reference.sourceTable}:${reference.sourceId}`;
}

function uniqueReferences(
  references: ReadonlyArray<QualificationEvidenceReference>,
): QualificationEvidenceReference[] {
  const byKey = new Map<string, QualificationEvidenceReference>();
  for (const reference of references) byKey.set(referenceKey(reference), reference);
  return [...byKey.values()].sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
}

function referencesFor(facts: ReadonlyArray<QualificationFact>): QualificationEvidenceReference[] {
  return uniqueReferences(facts.flatMap((fact) => fact.references));
}

function hasFreshReference(fact: QualificationFact): boolean {
  return fact.references.length > 0 && fact.references.some((reference) => reference.freshness !== "stale");
}

function usableFact(fact: QualificationFact): boolean {
  return fact.state === "positive" && hasFreshReference(fact) &&
    fact.references.every((reference) => reference.claimState !== "conflicting" && reference.evidenceState !== "conflicting");
}

function outcomeState(input: {
  positive: boolean;
  facts: ReadonlyArray<QualificationFact>;
  negative?: boolean;
  conflict?: boolean;
}): QualificationFactState {
  if (input.positive) return "positive";
  if (input.conflict || input.facts.some((fact) => fact.state === "conflicting")) return "conflicting";
  if (input.facts.some((fact) => fact.state === "stale" || fact.references.some((reference) => reference.freshness === "stale"))) {
    return "stale";
  }
  if (input.negative || input.facts.some((fact) => fact.state === "negative")) return "negative";
  return "missing";
}

function ruleOutcome(
  ruleById: ReadonlyMap<string, QualificationModel["scoreRules"][number]>,
  input: {
    ruleId: string;
    state: QualificationFactState;
    awarded: boolean;
    references?: ReadonlyArray<QualificationEvidenceReference>;
    explanation: string;
    missingFlag?: string | null;
    conflictFlag?: string | null;
  },
): QualificationRuleOutcome {
  const rule = ruleById.get(input.ruleId);
  if (!rule) throw new Error(`Unknown qualification rule: ${input.ruleId}`);
  return {
    component: rule.component,
    ruleId: rule.id,
    state: input.state,
    points: input.awarded ? rule.maximumPoints : 0,
    maximumPoints: rule.maximumPoints,
    evidenceReferences: uniqueReferences(input.references ?? []),
    explanation: input.explanation,
    missingFlag: input.missingFlag ?? (input.state === "missing" ? `missing:${rule.id}` : null),
    conflictFlag: input.conflictFlag ?? null,
  };
}

function currentExternalVerification(
  input: PoolServiceQualificationInput,
  dimension: Parameters<typeof isCurrentExternalVerification>[1],
) {
  return input.verifications.filter((verification) =>
    isCurrentExternalVerification({
      sourceClass: verification.sourceClass,
      claimState: verification.claimState,
      externalVerificationState: verification.externalVerificationState,
      verificationDimension: verification.verificationDimension,
      verifierId: verification.verifierId,
      verificationMethod: verification.verificationMethod,
      verificationResult: verification.verificationResult,
      verifiedAt: verification.verifiedAt,
      expiresAt: verification.expiresAt,
      normalizedValue: verification.normalizedValue,
      evidenceReference: verification.evidenceReference,
    }, dimension, input.evaluatedAt)
  );
}

function humanConfirmation(input: PoolServiceQualificationInput) {
  return input.verifications.filter((verification) =>
    verification.sourceClass === "human_review" &&
    verification.claimState === "human_confirmed" &&
    verification.humanReviewState === "accepted" &&
    verification.decisionState === "accepted" &&
    verification.verificationDimension?.startsWith("person_") &&
    Boolean(
      verification.humanReviewerId && verification.humanReviewedAt &&
      verification.normalizedValue && verification.evidenceReference
    )
  );
}

function priorityTier(score: number, model: QualificationModel): IcpPriorityTier {
  if (score >= model.thresholds.highPriorityMinimum) return "high_priority";
  if (score >= model.thresholds.qualifiedMinimum) return "qualified";
  if (score >= model.thresholds.qualifiedWithReviewMinimum) return "moderate";
  return "low";
}

function geographyParts(value: string): { country: string | null; subdivision: string | null } {
  const entries = new Map(value.split("|").map((part) => {
    const [key, ...remaining] = part.split(":");
    return [key, remaining.join(":")];
  }));
  return {
    country: entries.get("country")?.toUpperCase() ?? null,
    subdivision: entries.get("subdivision")?.toUpperCase() || null,
  };
}

function geographyMatches(location: QualificationFact, market: QualificationFact): boolean {
  const left = geographyParts(location.value);
  const right = geographyParts(market.value);
  if (!left.country || !right.country || left.country !== right.country) return false;
  if (!right.subdivision) return true;
  const leftSubdivision = left.subdivision?.includes("-")
    ? left.subdivision
    : left.subdivision ? `${left.country}-${left.subdivision}` : null;
  return leftSubdivision === right.subdivision;
}

function hardDisqualifiers(
  input: PoolServiceQualificationInput,
  model: QualificationModel,
): QualificationHardDisqualifier[] {
  const result: QualificationHardDisqualifier[] = [];
  const closed = input.operations.filter((operation) =>
    operation.kind === "closed" && operation.status === "negative" &&
    operation.fact.references.some((reference) =>
      ["observed", "source_confirmed", "externally_verified", "human_confirmed"].includes(reference.claimState ?? "")
    )
  );
  if (closed.length > 0) {
    result.push({
      ruleId: "hard.confirmed_closed",
      reason: "Persisted operational evidence explicitly states that the business is closed.",
      evidenceReferences: referencesFor(closed.map((entry) => entry.fact)),
    });
  }

  const locations = input.geography.locations.filter(usableFact);
  const markets = input.geography.selectedMarkets.filter(usableFact);
  if (locations.length > 0 && markets.length > 0 &&
    locations.every((location) => markets.every((market) => !geographyMatches(location, market)))) {
    result.push({
      ruleId: "hard.outside_selected_geography",
      reason: "Persisted business location evidence is outside every selected market subdivision.",
      evidenceReferences: referencesFor([...locations, ...markets]),
    });
  }

  const excluded = input.services.filter((service) =>
    service.state === "negative" && includesTerm(service.term, model.excludedOperatorTerms) &&
    hasFreshReference(service.fact)
  );
  const positiveServices = input.services.filter((service) =>
    service.state === "positive" &&
    (includesTerm(service.term, model.serviceTerms) ||
      includesTerm(service.term, model.relevantCategories)) &&
    hasFreshReference(service.fact)
  );
  if (excluded.length > 0 && positiveServices.length === 0) {
    result.push({
      ruleId: "hard.excluded_service_operator",
      reason: `Current persisted evidence identifies an excluded adjacent operator and contains no ${model.serviceLabel} evidence.`,
      evidenceReferences: referencesFor(excluded.map((entry) => entry.fact)),
    });
  }

  const materialReferences = uniqueReferences([
    ...(input.assessment ? [input.assessment.reference] : []),
    ...referencesFor(input.services.map((entry) => entry.fact)),
    ...referencesFor(input.operations.map((entry) => entry.fact)),
    ...referencesFor(input.conversions.map((entry) => entry.fact)),
    ...referencesFor(input.contacts.map((entry) => entry.fact)),
    ...referencesFor(input.people.map((entry) => entry.fact)),
    ...referencesFor(input.verifications.map((entry) => entry.fact)),
  ]).filter((reference) => reference.sourceClass !== null);
  if (materialReferences.length > 0 && materialReferences.every((reference) =>
    model.historicalOnlySourceClasses.includes(reference.sourceClass ?? "")
  )) {
    result.push({
      ruleId: "hard.historical_only_evidence",
      reason: "Only historical or legacy-unclassified evidence is available, with no current corroboration.",
      evidenceReferences: materialReferences,
    });
  }
  return result.sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

function buildOutcomes(
  input: PoolServiceQualificationInput,
  model: QualificationModel,
): QualificationRuleOutcome[] {
  const outcomes: QualificationRuleOutcome[] = [];
  const ruleById = new Map<string, QualificationModel["scoreRules"][number]>(
    model.scoreRules.map((rule) => [rule.id, rule]),
  );
  const positiveServices = input.services.filter((service) =>
    service.state === "positive" && usableFact(service.fact)
  );
  const relevantCategory = positiveServices.filter((service) =>
    service.basis === "provider_category" && includesTerm(service.term, model.relevantCategories)
  );
  const coreServices = positiveServices.filter((service) =>
    includesTerm(service.term, model.serviceTerms)
  );
  const firstPartyCoreServices = coreServices.filter((service) =>
    service.basis !== "provider_category" && service.fact.references.some((reference) =>
      reference.sourceClass === "public_business_website"
    )
  );
  const foundationCoreServiceEstablished = model.niche === "foundation_waterproofing" &&
    firstPartyCoreServices.length > 0;
  const uniqueServiceTerms = new Set(coreServices.map((service) => normalized(service.term ?? "")).filter(Boolean));
  const recurringServices = coreServices.filter((service) =>
    includesTerm(service.term, model.recurringServiceTerms)
  );
  const serviceFacts = input.services.map((service) => service.fact);
  const excludedService = input.services.some((service) => service.state === "negative");
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "niche.relevant_category",
    state: outcomeState({
      positive: relevantCategory.length > 0 || foundationCoreServiceEstablished,
      facts: serviceFacts,
      negative: excludedService,
    }),
    awarded: relevantCategory.length > 0 || foundationCoreServiceEstablished,
    references: referencesFor(
      (relevantCategory.length > 0 ? relevantCategory : firstPartyCoreServices).map((entry) => entry.fact),
    ),
    explanation: relevantCategory.length > 0
      ? `A persisted provider category identifies ${model.serviceLabel} work.`
      : foundationCoreServiceEstablished
      ? `Strong first-party website evidence establishes core ${model.serviceLabel} work without requiring a provider category.`
      : `No current persisted ${model.serviceLabel} provider category was available.`,
    missingFlag: serviceFacts.length === 0 ? "service_fit_unknown" : null,
  }));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "niche.core_service_observed",
    state: outcomeState({ positive: coreServices.length > 0, facts: serviceFacts, negative: excludedService }),
    awarded: coreServices.length > 0,
    references: referencesFor(coreServices.map((entry) => entry.fact)),
    explanation: coreServices.length > 0
      ? `Persisted evidence lists ${model.serviceLabel} work: ${[...uniqueServiceTerms].sort().join(", ")}.`
      : `No current persisted core ${model.serviceLabel} description was observed.`,
    missingFlag: serviceFacts.length === 0 ? "service_fit_unknown" : null,
  }));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "niche.multiple_services_observed",
    state: outcomeState({
      positive: uniqueServiceTerms.size >= 2 || foundationCoreServiceEstablished,
      facts: coreServices.map((entry) => entry.fact),
    }),
    awarded: uniqueServiceTerms.size >= 2 || foundationCoreServiceEstablished,
    references: referencesFor(coreServices.map((entry) => entry.fact)),
    explanation: uniqueServiceTerms.size >= 2
      ? `At least two distinct ${model.serviceLabel} offerings were observed.`
      : foundationCoreServiceEstablished
      ? `One strong first-party core ${model.serviceLabel} offering is sufficient for this niche.`
      : `Fewer than two distinct ${model.serviceLabel} offerings were observed.`,
    missingFlag: coreServices.length === 0 ? "service_breadth_unknown" : null,
  }));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "niche.recurring_service_observed",
    state: model.recurringServiceTerms.length === 0
      ? "not_applicable"
      : outcomeState({ positive: recurringServices.length > 0, facts: coreServices.map((entry) => entry.fact) }),
    awarded: recurringServices.length > 0,
    references: referencesFor(recurringServices.map((entry) => entry.fact)),
    explanation: model.recurringServiceTerms.length === 0
      ? `Recurring service language is not required for the ${model.serviceLabel} niche.`
      : recurringServices.length > 0
      ? "Recurring pool cleaning, maintenance, or service evidence was observed."
      : "Recurring pool-service work was not established by persisted evidence.",
    missingFlag: model.recurringServiceTerms.length > 0 && coreServices.length === 0
      ? "recurring_service_unknown"
      : null,
  }));

  const operation = (kind: string, status: string) =>
    input.operations.filter((entry) => entry.kind === kind && entry.status === status);
  const homepage = operation("homepage_usable", "positive");
  const https = operation("https_works", "positive");
  const identity = operation("identity_agreement", "positive");
  const operationFacts = input.operations.map((entry) => entry.fact);
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "legitimacy.homepage_usable",
    state: outcomeState({ positive: homepage.some((entry) => usableFact(entry.fact)), facts: operationFacts }),
    awarded: homepage.some((entry) => usableFact(entry.fact)),
    references: referencesFor(homepage.map((entry) => entry.fact)),
    explanation: homepage.length > 0
      ? "A successfully inspected homepage supports current business operation."
      : "A usable homepage was not established; crawl failure is not scored as website weakness.",
    missingFlag: input.assessment === null || ["blocked", "failed"].includes(input.assessment.status)
      ? "website_assessment_unavailable" : null,
  }));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "legitimacy.https_observed",
    state: outcomeState({ positive: https.some((entry) => usableFact(entry.fact)), facts: operationFacts }),
    awarded: https.some((entry) => usableFact(entry.fact)),
    references: referencesFor(https.map((entry) => entry.fact)),
    explanation: https.length > 0 ? "HTTPS worked in the persisted assessment." : "Working HTTPS was not observed.",
    missingFlag: input.assessment === null ? "https_status_unknown" : null,
  }));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "legitimacy.identity_agrees",
    state: outcomeState({
      positive: identity.some((entry) => usableFact(entry.fact)) || input.assessment?.identityState === "agrees",
      facts: operationFacts,
      conflict: input.assessment?.identityState === "conflicts",
    }),
    awarded: identity.some((entry) => usableFact(entry.fact)) || input.assessment?.identityState === "agrees",
    references: referencesFor(identity.map((entry) => entry.fact).concat(
      input.assessment ? [{ value: input.assessment.identityState, state: "positive", references: [input.assessment.reference] }] : [],
    )),
    explanation: input.assessment?.identityState === "agrees"
      ? "Assessed website identity agrees with the persisted business identity."
      : "Website-to-business identity agreement was not established.",
    missingFlag: input.assessment?.identityState === "unavailable" || !input.assessment ? "website_identity_unknown" : null,
    conflictFlag: input.assessment?.identityState === "conflicts" ? "website_identity_conflict" : null,
  }));
  const locations = input.geography.locations.filter(usableFact);
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "legitimacy.location_observed",
    state: outcomeState({ positive: locations.length > 0, facts: input.geography.locations }),
    awarded: locations.length > 0,
    references: referencesFor(locations),
    explanation: locations.length > 0 ? "A persisted business location was observed." : "Business location evidence is missing.",
    missingFlag: locations.length === 0 ? "business_location_missing" : null,
  }));
  const structured = input.structuredBusinessData.filter(usableFact);
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "legitimacy.structured_business_data",
    state: outcomeState({ positive: structured.length > 0, facts: input.structuredBusinessData }),
    awarded: structured.length > 0,
    references: referencesFor(structured),
    explanation: structured.length > 0
      ? "Structured business data was observed on assessed pages."
      : "No current structured business data was available.",
    missingFlag: input.assessment === null ? "structured_business_data_unknown" : null,
  }));

  const conversion = (feature: string) => input.conversions.filter((entry) => entry.feature === feature);
  const absenceOutcome = (ruleId: string, feature: string, explanation: string, maximumMissingFlag: string) => {
    const facts = conversion(feature);
    const absent = facts.filter((entry) => entry.status === "absent_after_successful_inspection" && usableFact(entry.fact));
    const present = facts.filter((entry) => entry.status === "present");
    outcomes.push(ruleOutcome(ruleById, {
      ruleId,
      state: absent.length > 0 ? "positive" : present.length > 0 ? "negative" : outcomeState({ positive: false, facts: facts.map((entry) => entry.fact) }),
      awarded: absent.length > 0,
      references: referencesFor((absent.length > 0 ? absent : present).map((entry) => entry.fact)),
      explanation: absent.length > 0 ? explanation : present.length > 0
        ? `${feature.replaceAll("_", " ")} was observed, so no absence-based opportunity credit was awarded.`
        : `${feature.replaceAll("_", " ")} was not truthfully assessable from the persisted inspection.`,
      missingFlag: facts.length === 0 || facts.every((entry) => !["present", "absent_after_successful_inspection"].includes(entry.status))
        ? maximumMissingFlag : null,
    }));
  };
  absenceOutcome("opportunity.booking_absent", "booking", "No online scheduling pathway was observed after successful inspection.", "booking_assessment_unknown");
  absenceOutcome("opportunity.contact_form_absent", "contact_form", "No contact form was observed after successful inspection.", "contact_form_assessment_unknown");
  absenceOutcome("opportunity.estimate_request_absent", "estimate_request", "No estimate-request pathway was observed after successful inspection.", "estimate_request_assessment_unknown");
  absenceOutcome("opportunity.primary_cta_absent", "primary_cta", "No primary call to action was observed after successful inspection.", "primary_cta_assessment_unknown");
  const phones = input.contacts.filter((contact) => contact.kind === "phone" && usableFact(contact.fact));
  const bookingAbsent = conversion("booking").some((entry) => entry.status === "absent_after_successful_inspection" && usableFact(entry.fact));
  const formAbsent = conversion("contact_form").some((entry) => entry.status === "absent_after_successful_inspection" && usableFact(entry.fact));
  const phoneOnly = phones.length > 0 && bookingAbsent && formAbsent;
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "opportunity.phone_only_dependency",
    state: phoneOnly ? "positive" : phones.length === 0 ? "missing" : "negative",
    awarded: phoneOnly,
    references: uniqueReferences([
      ...referencesFor(phones.map((entry) => entry.fact)),
      ...referencesFor(conversion("booking").map((entry) => entry.fact)),
      ...referencesFor(conversion("contact_form").map((entry) => entry.fact)),
    ]),
    explanation: phoneOnly
      ? "A public phone was observed while both booking and contact-form pathways were absent after successful inspection."
      : "Phone-only conversion dependency was not established.",
    missingFlag: phones.length === 0 ? "phone_missing" : null,
  }));

  const assessmentDomain = input.assessment?.canonicalHomepageUrl || input.assessment?.sourceWebsiteUrl;
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "contact.domain_observed",
    state: assessmentDomain && input.assessment?.reference.freshness !== "stale" ? "positive" : input.assessment ? "stale" : "missing",
    awarded: Boolean(assessmentDomain && input.assessment?.reference.freshness !== "stale"),
    references: input.assessment ? [input.assessment.reference] : [],
    explanation: assessmentDomain ? "A business website domain was persisted." : "No business website domain was persisted.",
    missingFlag: assessmentDomain ? null : "business_domain_missing",
  }));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "contact.public_phone_observed",
    state: outcomeState({ positive: phones.length > 0, facts: input.contacts.filter((entry) => entry.kind === "phone").map((entry) => entry.fact) }),
    awarded: phones.length > 0,
    references: referencesFor(phones.map((entry) => entry.fact)),
    explanation: phones.length > 0
      ? "A public phone candidate was observed; reachability is scored separately."
      : "No public phone candidate was observed.",
    missingFlag: phones.length === 0 ? "phone_missing" : null,
  }));
  const verifiedPhone = currentExternalVerification(input, "phone_reachability");
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "contact.phone_reachability_verified",
    state: verifiedPhone.length > 0 ? "positive" : "missing",
    awarded: verifiedPhone.length > 0,
    references: referencesFor(verifiedPhone.map((entry) => entry.fact)),
    explanation: verifiedPhone.length > 0
      ? "A current, dimension-specific external phone-reachability verification passed."
      : "Public phone evidence has no current external reachability verification.",
    missingFlag: verifiedPhone.length === 0 ? "phone_reachability_not_verified" : null,
  }));
  const emails = input.contacts.filter((contact) => contact.kind === "email" && usableFact(contact.fact));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "contact.public_email_observed",
    state: outcomeState({ positive: emails.length > 0, facts: input.contacts.filter((entry) => entry.kind === "email").map((entry) => entry.fact) }),
    awarded: emails.length > 0,
    references: referencesFor(emails.map((entry) => entry.fact)),
    explanation: emails.length > 0
      ? "A public email candidate was observed; deliverability is scored separately."
      : "No public email candidate was observed.",
    missingFlag: emails.length === 0 ? "email_missing" : null,
  }));
  const verifiedEmail = currentExternalVerification(input, "email_deliverability");
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "contact.email_deliverability_verified",
    state: verifiedEmail.length > 0 ? "positive" : "missing",
    awarded: verifiedEmail.length > 0,
    references: referencesFor(verifiedEmail.map((entry) => entry.fact)),
    explanation: verifiedEmail.length > 0
      ? "A current, dimension-specific external email-deliverability verification passed."
      : "Public email evidence has no current external deliverability verification.",
    missingFlag: verifiedEmail.length === 0 ? "email_deliverability_not_verified" : null,
  }));
  const forms = conversion("contact_form").filter((entry) => entry.status === "present" && usableFact(entry.fact));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "contact.form_observed",
    state: outcomeState({ positive: forms.length > 0, facts: conversion("contact_form").map((entry) => entry.fact), negative: formAbsent }),
    awarded: forms.length > 0,
    references: referencesFor(forms.map((entry) => entry.fact)),
    explanation: forms.length > 0 ? "A contact form was observed." : "No current contact form was observed.",
    missingFlag: conversion("contact_form").length === 0 ? "contact_form_assessment_unknown" : null,
  }));
  const channelCount = [phones.length > 0, emails.length > 0, forms.length > 0].filter(Boolean).length;
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "contact.multiple_channels",
    state: channelCount >= 2 ? "positive" : channelCount === 0 ? "missing" : "negative",
    awarded: channelCount >= 2,
    references: uniqueReferences([
      ...referencesFor(phones.map((entry) => entry.fact)),
      ...referencesFor(emails.map((entry) => entry.fact)),
      ...referencesFor(forms.map((entry) => entry.fact)),
    ]),
    explanation: channelCount >= 2 ? "At least two public contact channels were observed." : "Fewer than two contact channels were observed.",
    missingFlag: channelCount === 0 ? "contact_channels_missing" : null,
  }));

  const people = input.people.filter((person) => usableFact(person.fact));
  const titledPeople = people.filter((person) => Boolean(person.displayedTitle?.trim()));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "person.name_observed",
    state: outcomeState({ positive: people.length > 0, facts: input.people.map((entry) => entry.fact) }),
    awarded: people.length > 0,
    references: referencesFor(people.map((entry) => entry.fact)),
    explanation: people.length > 0
      ? "A person name was observed as unverified candidate evidence."
      : "No person name was observed; this does not imply that no decision-maker exists.",
    missingFlag: people.length === 0 ? "decision_maker_unknown" : null,
  }));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "person.title_observed",
    state: titledPeople.length > 0 ? "positive" : people.length > 0 ? "missing" : "missing",
    awarded: titledPeople.length > 0,
    references: referencesFor(titledPeople.map((entry) => entry.fact)),
    explanation: titledPeople.length > 0
      ? "A role or title was observed, without treating it as verified authority."
      : "No role or title was observed.",
    missingFlag: titledPeople.length === 0 ? "decision_maker_title_unknown" : null,
  }));
  const employment = currentExternalVerification(input, "person_current_employment");
  const owner = currentExternalVerification(input, "person_owner_relationship");
  const authority = currentExternalVerification(input, "person_decision_authority");
  const human = humanConfirmation(input);
  const verificationOutcome = (
    ruleId: string,
    matches: ReturnType<typeof currentExternalVerification>,
    passed: string,
    missing: string,
    flag: string,
  ) => outcomes.push(ruleOutcome(ruleById, {
    ruleId,
    state: matches.length > 0 ? "positive" : "missing",
    awarded: matches.length > 0,
    references: referencesFor(matches.map((entry) => entry.fact)),
    explanation: matches.length > 0 ? passed : missing,
    missingFlag: matches.length === 0 ? flag : null,
  }));
  verificationOutcome("person.employment_verified", employment,
    "Current employment was externally verified for the compatible dimension.",
    "Observed person evidence has no current employment verification.", "person_employment_not_verified");
  verificationOutcome("person.owner_relationship_verified", owner,
    "Owner relationship was externally verified for the owner dimension.",
    "Observed person or title evidence has no current owner-relationship verification.", "owner_relationship_not_verified");
  verificationOutcome("person.decision_authority_verified", authority,
    "Decision authority was externally verified for the compatible dimension.",
    "Observed title evidence has no current decision-authority verification.", "decision_authority_not_verified");
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "person.human_confirmation",
    state: human.length > 0 ? "positive" : "missing",
    awarded: human.length > 0,
    references: referencesFor(human.map((entry) => entry.fact)),
    explanation: human.length > 0
      ? "An auditable accepted human confirmation is present and remains separately labeled."
      : "No auditable accepted human confirmation is present.",
    missingFlag: human.length === 0 ? "human_confirmation_missing" : null,
  }));

  const identityResolved = input.identityReview.state === "clear" || input.identityReview.state === "resolved";
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "readiness.identity_resolved",
    state: identityResolved ? "positive" : input.identityReview.state === "required" ? "conflicting" : "missing",
    awarded: identityResolved,
    references: input.identityReview.references,
    explanation: identityResolved ? "Business identity is sufficiently resolved for internal scoring." : "Business identity is unresolved or unavailable.",
    missingFlag: input.identityReview.state === "unavailable" ? "identity_state_unavailable" : null,
    conflictFlag: input.identityReview.state === "required" ? "identity_review_required" : null,
  }));
  const assessmentComplete = input.assessment?.status === "complete" && input.assessment.reference.freshness !== "stale";
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "readiness.assessment_complete",
    state: assessmentComplete ? "positive" : input.assessment?.reference.freshness === "stale" ? "stale" : input.assessment ? "negative" : "missing",
    awarded: assessmentComplete,
    references: input.assessment ? [input.assessment.reference] : [],
    explanation: assessmentComplete ? "The persisted website assessment completed successfully." : "A current complete website assessment is unavailable.",
    missingFlag: input.assessment ? null : "website_assessment_missing",
  }));
  const contactRoutes = conversion("contact_route").filter((entry) => entry.status === "present" && usableFact(entry.fact));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "readiness.contact_route",
    state: outcomeState({ positive: contactRoutes.length > 0 || phones.length > 0 || emails.length > 0, facts: input.contacts.map((entry) => entry.fact) }),
    awarded: contactRoutes.length > 0 || phones.length > 0 || emails.length > 0,
    references: uniqueReferences([
      ...referencesFor(contactRoutes.map((entry) => entry.fact)),
      ...referencesFor(phones.map((entry) => entry.fact)),
      ...referencesFor(emails.map((entry) => entry.fact)),
    ]),
    explanation: contactRoutes.length > 0 || phones.length > 0 || emails.length > 0
      ? "At least one public outreach route is persisted."
      : "No public outreach route is persisted.",
    missingFlag: contactRoutes.length === 0 && phones.length === 0 && emails.length === 0 ? "outreach_route_missing" : null,
  }));
  const allInputReferences = uniqueReferences([
    input.business.reference,
    ...(input.assessment ? [input.assessment.reference] : []),
    ...referencesFor(input.geography.locations),
    ...referencesFor(input.services.map((entry) => entry.fact)),
    ...referencesFor(input.operations.map((entry) => entry.fact)),
    ...referencesFor(input.conversions.map((entry) => entry.fact)),
    ...referencesFor(input.contacts.map((entry) => entry.fact)),
    ...referencesFor(input.people.map((entry) => entry.fact)),
    ...referencesFor(input.verifications.map((entry) => entry.fact)),
  ]);
  const currentReferences = allInputReferences.filter((reference) => reference.freshness === "current");
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "readiness.current_evidence",
    state: currentReferences.length > 0 ? "positive" : allInputReferences.some((reference) => reference.freshness === "stale") ? "stale" : "missing",
    awarded: currentReferences.length > 0,
    references: currentReferences,
    explanation: currentReferences.length > 0 ? "At least one current evidence reference supports readiness." : "No current evidence reference supports readiness.",
    missingFlag: allInputReferences.length === 0 ? "current_evidence_missing" : null,
  }));
  const businessUsable = !["rejected", "conflicting"].includes(input.business.state);
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "readiness.business_record_usable",
    state: businessUsable ? "positive" : "conflicting",
    awarded: businessUsable,
    references: [input.business.reference],
    explanation: businessUsable ? "The persisted business record is usable for internal evaluation." : "The business record is rejected or conflicting.",
    conflictFlag: businessUsable ? null : "business_record_conflicting",
  }));

  const currentAssessment = input.assessment?.reference.freshness === "current";
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "quality.current_assessment",
    state: currentAssessment ? "positive" : input.assessment ? "stale" : "missing",
    awarded: currentAssessment,
    references: input.assessment ? [input.assessment.reference] : [],
    explanation: currentAssessment ? "The website assessment is within its persisted freshness window." : "The website assessment is missing or stale.",
    missingFlag: input.assessment ? null : "website_assessment_missing",
  }));
  const auditable = allInputReferences.length > 0 && allInputReferences.every((reference) =>
    reference.sourceId.trim().length > 0 && reference.sourceTable.trim().length > 0
  );
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "quality.auditable_lineage",
    state: auditable ? "positive" : "missing",
    awarded: auditable,
    references: allInputReferences,
    explanation: auditable ? "All cited inputs have stable persisted table and row references." : "Auditable evidence lineage is incomplete.",
    missingFlag: auditable ? null : "evidence_lineage_incomplete",
  }));
  const explicitProvenance = allInputReferences.filter((reference) =>
    reference.sourceClass !== null && reference.sourceClass !== "legacy_unclassified"
  );
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "quality.explicit_provenance",
    state: explicitProvenance.length > 0 ? "positive" : "missing",
    awarded: explicitProvenance.length > 0,
    references: explicitProvenance,
    explanation: explicitProvenance.length > 0 ? "Cited evidence has explicit non-legacy provenance." : "Only missing or legacy-unclassified provenance is available.",
    missingFlag: explicitProvenance.length > 0 ? null : "explicit_provenance_missing",
  }));
  const sourceClasses = new Set(explicitProvenance.map((reference) => reference.sourceClass));
  outcomes.push(ruleOutcome(ruleById, {
    ruleId: "quality.corroborated_sources",
    state: sourceClasses.size >= 2 ? "positive" : "missing",
    awarded: sourceClasses.size >= 2,
    references: explicitProvenance,
    explanation: sourceClasses.size >= 2
      ? "At least two explicit source classes corroborate the evaluation."
      : "Independent source-class corroboration is not available.",
    missingFlag: sourceClasses.size >= 2 ? null : "source_corroboration_missing",
  }));

  return outcomes;
}

function components(
  outcomes: ReadonlyArray<QualificationRuleOutcome>,
  model: QualificationModel,
): QualificationComponentScore[] {
  return ICP_SCORE_COMPONENTS.map((component) => {
    const componentOutcomes = outcomes.filter((outcome) => outcome.component === component);
    const points = componentOutcomes.reduce((total, outcome) => total + outcome.points, 0);
    const maximumPoints = componentOutcomes.reduce((total, outcome) => total + outcome.maximumPoints, 0);
    if (maximumPoints !== model.componentWeights[component]) {
      throw new Error(`${model.serviceLabel} ICP component ${component} has an invalid maximum`);
    }
    return { component, points, maximumPoints, outcomes: componentOutcomes };
  });
}

function resultState(input: {
  qualificationInput: PoolServiceQualificationInput;
  model: QualificationModel;
  score: number;
  hardDisqualifiers: ReadonlyArray<QualificationHardDisqualifier>;
  hasFreshServiceFit: boolean;
  citedReferences: ReadonlyArray<QualificationEvidenceReference>;
}): IcpQualificationResult {
  if (input.hardDisqualifiers.length > 0) return "disqualified";
  if (input.qualificationInput.identityReview.state === "required" ||
    input.qualificationInput.business.state === "human_review") return "identity_review_required";
  const materialEvidence = input.citedReferences.filter((reference) => reference.sourceTable !== "businesses");
  if (materialEvidence.length === 0) return "not_evaluated";
  if (input.qualificationInput.assessment?.reference.freshness === "stale" ||
    (materialEvidence.length > 0 && materialEvidence.every((reference) => reference.freshness === "stale"))) {
    return "stale_evidence";
  }
  if (!input.hasFreshServiceFit) return "insufficient_evidence";
  if (input.score >= input.model.thresholds.qualifiedMinimum) return "qualified";
  if (input.score >= input.model.thresholds.qualifiedWithReviewMinimum) return "qualified_with_review";
  return "insufficient_evidence";
}

function finalExplanation(input: {
  result: IcpQualificationResult;
  score: number;
  tier: IcpPriorityTier;
  components: ReadonlyArray<QualificationComponentScore>;
  hard: ReadonlyArray<QualificationHardDisqualifier>;
  missing: ReadonlyArray<string>;
  freshness: ReadonlyArray<string>;
  reviewReasons: ReadonlyArray<string>;
}): string {
  const parts = [
    `ICP result ${input.result}; deterministic score ${input.score}/100 (${input.tier}).`,
    `Components: ${input.components.map((component) =>
      `${component.component} ${component.points}/${component.maximumPoints}`
    ).join("; ")}.`,
  ];
  if (input.hard.length > 0) parts.push(`Hard disqualifiers: ${input.hard.map((entry) => entry.reason).join(" ")}`);
  if (input.reviewReasons.length > 0) parts.push(`Review required: ${input.reviewReasons.join(", ")}.`);
  if (input.missing.length > 0) parts.push(`Missing information: ${input.missing.join(", ")}.`);
  if (input.freshness.length > 0) parts.push(`Freshness warnings: ${input.freshness.join(", ")}.`);
  return parts.join(" ");
}

export function qualifyLead(
  input: PoolServiceQualificationInput,
  options: { modelVersion: string; supersedesEvaluationId?: string | null },
): PoolServiceQualificationResult {
  canonicalIso("Qualification evaluation time", input.evaluatedAt);
  const model = qualificationModelForVersion(options.modelVersion);
  if (input.business.nicheId !== model.niche) {
    throw new Error(`${model.version} can evaluate only ${model.niche} businesses`);
  }

  const inputFingerprint = stableHash({ modelVersion: options.modelVersion, input });
  const evaluationId = stableId("icp_qualification", {
    businessId: input.business.id,
    modelVersion: options.modelVersion,
    inputFingerprint,
  });
  const hard = hardDisqualifiers(input, model);
  const outcomes = buildOutcomes(input, model);
  const componentScores = components(outcomes, model);
  const overallScore = componentScores.reduce((total, component) => total + component.points, 0);
  if (!Number.isInteger(overallScore) || overallScore < 0 || overallScore > 100) {
    throw new Error(`${model.serviceLabel} ICP score must be an integer between 0 and 100`);
  }
  const citedReferences = uniqueReferences([
    ...outcomes.flatMap((outcome) => outcome.evidenceReferences),
    ...hard.flatMap((entry) => entry.evidenceReferences),
  ]);
  const hasFreshServiceFit = input.services.some((service) =>
    service.state === "positive" && usableFact(service.fact) &&
    (includesTerm(service.term, model.serviceTerms) ||
      includesTerm(service.term, model.relevantCategories))
  );
  const icpResult = resultState({
    qualificationInput: input,
    model,
    score: overallScore,
    hardDisqualifiers: hard,
    hasFreshServiceFit,
    citedReferences,
  });
  const tier = priorityTier(overallScore, model);
  const missingInformationFlags = [...new Set([
    ...outcomes.map((outcome) => outcome.missingFlag).filter((value): value is string => Boolean(value)),
    ...(input.geography.selectedMarkets.length === 0 ? ["selected_geography_missing"] : []),
    "suppression_state_unavailable",
  ])].sort();
  const freshnessWarnings = [...new Set([
    ...citedReferences.filter((reference) => reference.freshness === "stale")
      .map((reference) => `stale:${reference.sourceTable}:${reference.sourceId}`),
    ...(input.assessment?.reference.freshness === "stale" ? ["website_assessment_stale"] : []),
  ])].sort();
  const failedVerification = input.verifications.filter((verification) =>
    verification.verificationResult === "failed" || verification.externalVerificationState === "failed"
  );
  const verificationLimitations = [...new Set([
    ...(input.contacts.some((entry) => entry.kind === "phone") && currentExternalVerification(input, "phone_reachability").length === 0
      ? ["public_phone_observed_but_reachability_not_verified"] : []),
    ...(input.contacts.some((entry) => entry.kind === "email") && currentExternalVerification(input, "email_deliverability").length === 0
      ? ["public_email_observed_but_deliverability_not_verified"] : []),
    ...(input.people.length > 0 && currentExternalVerification(input, "person_owner_relationship").length === 0
      ? ["person_observed_but_owner_relationship_not_verified"] : []),
    ...(input.people.some((entry) => entry.displayedTitle) && currentExternalVerification(input, "person_decision_authority").length === 0
      ? ["title_observed_but_decision_authority_not_verified"] : []),
    ...failedVerification.map((entry) => `verification_failed:${entry.verificationDimension ?? entry.fieldName}`),
    "confidence_is_recorded_but_not_treated_as_verification",
  ])].sort();
  const reviewReasons = [...new Set([
    ...input.identityReview.reasons,
    ...(icpResult === "qualified_with_review" ? ["moderate_score_requires_review"] : []),
    ...(icpResult === "insufficient_evidence" ? ["qualification_evidence_incomplete"] : []),
    ...(icpResult === "stale_evidence" ? ["fresh_evidence_required"] : []),
    ...(icpResult === "not_evaluated" ? ["no_scorable_persisted_evidence"] : []),
  ])].sort();
  const reviewRequired = [
    "qualified_with_review",
    "insufficient_evidence",
    "identity_review_required",
    "stale_evidence",
    "not_evaluated",
  ].includes(icpResult);
  const confidences = citedReferences
    .map((reference) => reference.confidenceBasisPoints)
    .filter((value): value is number => value !== null);
  const sourceClasses = [...new Set(citedReferences
    .map((reference) => reference.sourceClass)
    .filter((value): value is NonNullable<typeof value> => value !== null))].sort();
  const positiveSignals: QualificationSignal[] = outcomes
    .filter((outcome) => outcome.points > 0)
    .map((outcome) => ({
      ruleId: outcome.ruleId,
      component: outcome.component,
      explanation: outcome.explanation,
      evidenceReferences: outcome.evidenceReferences,
    }));
  const negativeSignals: QualificationSignal[] = [
    ...hard.map((entry) => ({
      ruleId: entry.ruleId,
      component: "hard_gate" as const,
      explanation: entry.reason,
      evidenceReferences: entry.evidenceReferences,
    })),
    ...outcomes.filter((outcome) => outcome.state === "negative" || outcome.state === "conflicting")
      .map((outcome) => ({
        ruleId: outcome.ruleId,
        component: outcome.component,
        explanation: outcome.explanation,
        evidenceReferences: outcome.evidenceReferences,
      })),
  ];
  const deadlines = citedReferences.map((reference) => reference.freshUntil)
    .filter((value): value is string => Boolean(value))
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort();
  const freshUntil = deadlines[0] ?? input.evaluatedAt;
  const explanation = finalExplanation({
    result: icpResult,
    score: overallScore,
    tier,
    components: componentScores,
    hard,
    missing: missingInformationFlags,
    freshness: freshnessWarnings,
    reviewReasons: reviewRequired ? reviewReasons : [],
  });

  return {
    evaluationId,
    supersedesEvaluationId: options.supersedesEvaluationId ?? null,
    modelVersion: options.modelVersion,
    niche: model.niche,
    businessId: input.business.id,
    runId: input.runId,
    evaluatedAt: input.evaluatedAt,
    freshUntil,
    inputFingerprint,
    icpResult,
    overallScore,
    priorityTier: tier,
    componentScores,
    hardDisqualifiers: hard,
    positiveSignals,
    negativeSignals,
    missingInformationFlags,
    evidenceReferences: citedReferences,
    freshnessWarnings,
    verificationLimitations,
    identityReviewState: input.identityReview.state,
    reviewRequirements: { required: reviewRequired, reasons: reviewRequired ? reviewReasons : [] },
    confidence: {
      observedMinimumBasisPoints: confidences.length > 0 ? Math.min(...confidences) : null,
      observedMaximumBasisPoints: confidences.length > 0 ? Math.max(...confidences) : null,
      usedAsVerification: false,
    },
    evidenceQuality: {
      currentReferences: citedReferences.filter((reference) => reference.freshness === "current").length,
      staleReferences: citedReferences.filter((reference) => reference.freshness === "stale").length,
      unknownFreshnessReferences: citedReferences.filter((reference) => reference.freshness === "unknown").length,
      conflictingReferences: citedReferences.filter((reference) =>
        reference.claimState === "conflicting" || reference.evidenceState === "conflicting"
      ).length,
      sourceClasses,
    },
    finalExplanation: explanation,
  };
}

/** Pool-only compatibility surface retained for offline orchestration and tests. */
export function qualifyPoolServiceLead(
  input: PoolServiceQualificationInput,
  options: { modelVersion: string; supersedesEvaluationId?: string | null },
): PoolServiceQualificationResult {
  if (options.modelVersion !== POOL_SERVICE_ICP_MODEL_VERSION) {
    throw new Error(`Unsupported pool-service ICP model version: ${options.modelVersion}`);
  }
  if (input.business.nicheId !== "pool_service") {
    throw new Error("Pool-service ICP v1 can evaluate only pool_service businesses");
  }
  return qualifyLead(input, options);
}
