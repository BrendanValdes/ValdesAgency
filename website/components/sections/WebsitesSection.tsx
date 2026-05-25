import ServiceShell from "./ServiceShell";
import MacBookFrame from "@/components/visuals/MacBookFrame";
import { SECTION_3_WEBSITES } from "@/lib/copy";

export default function WebsitesSection() {
  return (
    <ServiceShell
      id="websites"
      number="03 / Websites"
      copy={SECTION_3_WEBSITES}
      visual={<MacBookFrame />}
      background="paper"
      from="left"
      visualSide="right"
    />
  );
}
