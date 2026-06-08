import ServiceShell from "./ServiceShell";
import AvaSplitScreen from "@/components/visuals/AvaSplitScreen";
import { SECTION_NEVER_MISS } from "@/lib/copy";

export default function NeverMissLeadSection() {
  return (
    <ServiceShell
      id="never-miss-a-lead"
      copy={SECTION_NEVER_MISS}
      visual={<AvaSplitScreen />}
      background="ink"
      from="right"
      visualSide="right"
    />
  );
}
