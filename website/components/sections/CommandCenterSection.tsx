import ServiceShell from "./ServiceShell";
import CommandCenterMockup from "@/components/visuals/CommandCenterMockup";
import { SECTION_COMMAND_CENTER } from "@/lib/copy";

export default function CommandCenterSection() {
  return (
    <ServiceShell
      id="command-center"
      copy={SECTION_COMMAND_CENTER}
      visual={<CommandCenterMockup />}
      background="paper"
      from="left"
      visualSide="left"
      visualClassName="pb-16"
    />
  );
}
