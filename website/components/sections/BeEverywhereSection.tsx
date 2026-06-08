import ServiceShell from "./ServiceShell";
import AdsVisual from "@/components/visuals/AdsVisual";
import { SECTION_BE_EVERYWHERE } from "@/lib/copy";

export default function BeEverywhereSection() {
  return (
    <ServiceShell
      id="be-everywhere"
      copy={SECTION_BE_EVERYWHERE}
      visual={<AdsVisual />}
      background="paper"
      from="left"
      visualSide="left"
    />
  );
}
