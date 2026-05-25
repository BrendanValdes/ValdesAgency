import ServiceShell from "./ServiceShell";
import CommandCenterMockup from "@/components/visuals/CommandCenterMockup";
import { SECTION_8_COMMAND_CENTER } from "@/lib/copy";

/**
 * Section 8 — Your Business Command Center
 *
 * The proprietary-software hero moment. Black + orange platform glow.
 * Dashboard + phone mockup side-by-side, both with glass treatment.
 * The glow comes from the visual mockup itself (orange radial behind
 * the dashboard).
 */
export default function CommandCenterSection() {
  return (
    <ServiceShell
      id="command-center"
      number="08 / Command center"
      copy={SECTION_8_COMMAND_CENTER}
      visual={<CommandCenterMockup />}
      background="ink"
      from="right"
      visualSide="right"
      visualClassName="pb-16"
    />
  );
}
