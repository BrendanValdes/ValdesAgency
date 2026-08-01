import { stableId } from "../shared/stable.js";
import { isCurrentExternalVerification } from "../domain/provenance.js";
import type {
  BusinessGroup,
  BusinessIdentityRecord,
  IdentityMatchDecision,
} from "./hierarchy.js";

export function groupBusinessLocations(
  records: ReadonlyArray<BusinessIdentityRecord>,
  decisions: ReadonlyArray<IdentityMatchDecision> = [],
  currentAt = new Date().toISOString(),
): BusinessGroup[] {
  const links = new Map<string, string>();
  for (const record of records) links.set(record.entityId, record.entityId);
  const root = (id: string): string => {
    const parent = links.get(id) ?? id;
    if (parent === id) return id;
    const resolved = root(parent);
    links.set(id, resolved);
    return resolved;
  };
  const join = (left: string, right: string) => {
    const roots = [root(left), root(right)].sort();
    if (roots[0] && roots[1]) links.set(roots[1], roots[0]);
  };
  for (const decision of decisions) {
    if (decision.action === "auto_merge" || decision.action === "group_link") {
      join(decision.leftEntityId, decision.rightEntityId);
    }
  }
  const explicitGroups = new Map<string, string>();
  for (const record of records) {
    const key = record.groupId ??
      (record.chainAffiliation && isCurrentExternalVerification(
        record.chainAffiliation.evidence,
        "business_canonical_domain",
        currentAt,
      )
        ? record.chainAffiliation.brandName
        : null);
    if (!key) continue;
    const existing = explicitGroups.get(key);
    if (existing) join(existing, record.entityId);
    else explicitGroups.set(key, record.entityId);
  }

  const grouped = new Map<string, BusinessIdentityRecord[]>();
  for (const record of records) {
    const key = root(record.entityId);
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }
  return [...grouped.values()].map((members) => {
    const ordered = [...members].sort((left, right) => left.entityId.localeCompare(right.entityId));
    const first = ordered[0] as BusinessIdentityRecord;
    const aliasMap = new Map<string, { name: string; kind: "dba" | "display" | "legal" }>();
    for (const member of ordered) {
      aliasMap.set(`display:${member.displayName}`, { name: member.displayName, kind: "display" });
      for (const dba of member.dbaNames) aliasMap.set(`dba:${dba}`, { name: dba, kind: "dba" });
      if (member.legalName) aliasMap.set(`legal:${member.legalName}`, { name: member.legalName, kind: "legal" });
    }
    const locationIds = [...new Set(ordered.map((member) => member.locationId))].sort();
    return {
      groupId: first.groupId ?? stableId("business_group", ordered.map((member) => member.entityId)),
      displayName: first.chainAffiliation?.brandName ?? first.displayName,
      legalName: ordered.find((member) => member.legalName)?.legalName ?? null,
      chainAffiliation: ordered.find((member) => member.chainAffiliation)?.chainAffiliation ?? null,
      locationIds,
      aliases: [...aliasMap.values()].sort((left, right) => left.name.localeCompare(right.name)),
    };
  }).sort((left, right) => left.groupId.localeCompare(right.groupId));
}

export function deduplicateIdentityCandidates(
  records: ReadonlyArray<BusinessIdentityRecord>,
  matcher: (left: BusinessIdentityRecord, right: BusinessIdentityRecord) => IdentityMatchDecision,
): IdentityMatchDecision[] {
  const ordered = [...records].sort((left, right) => left.entityId.localeCompare(right.entityId));
  const decisions: IdentityMatchDecision[] = [];
  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      const leftRecord = ordered[left];
      const rightRecord = ordered[right];
      if (leftRecord && rightRecord) decisions.push(matcher(leftRecord, rightRecord));
    }
  }
  return decisions;
}
