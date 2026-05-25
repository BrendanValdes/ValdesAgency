import ServiceShell from "./ServiceShell";
import PipelineFlow from "@/components/visuals/PipelineFlow";
import { SECTION_5_FUNNEL } from "@/lib/copy";

export default function FunnelSection() {
  return (
    <ServiceShell
      id="funnel"
      number="05 / Funnel building"
      copy={SECTION_5_FUNNEL}
      visual={<PipelineFlow />}
      background="paper"
      from="left"
      visualSide="right"
    />
  );
}
