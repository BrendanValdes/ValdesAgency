import ServiceShell from "./ServiceShell";
import NodeNetwork from "@/components/visuals/NodeNetwork";
import { SECTION_6_CRM } from "@/lib/copy";

export default function CRMSection() {
  return (
    <ServiceShell
      id="crm"
      number="06 / Automations"
      copy={SECTION_6_CRM}
      visual={<NodeNetwork />}
      background="ink"
      from="right"
      visualSide="right"
    />
  );
}
