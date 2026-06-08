import ServiceShell from "./ServiceShell";
import PipelineFlow from "@/components/visuals/PipelineFlow";
import { SECTION_LEAD_CAPTURE } from "@/lib/copy";

export default function LeadCaptureSection() {
  return (
    <ServiceShell
      id="lead-capture"
      copy={SECTION_LEAD_CAPTURE}
      visual={<PipelineFlow />}
      background="paper"
      from="left"
      visualSide="left"
    />
  );
}
