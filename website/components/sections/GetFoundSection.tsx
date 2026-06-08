import ServiceShell from "./ServiceShell";
import MacBookFrame from "@/components/visuals/MacBookFrame";
import { SECTION_GET_FOUND } from "@/lib/copy";

export default function GetFoundSection() {
  return (
    <ServiceShell
      id="get-found"
      copy={SECTION_GET_FOUND}
      visual={<MacBookFrame />}
      background="ink"
      from="right"
      visualSide="right"
    />
  );
}
