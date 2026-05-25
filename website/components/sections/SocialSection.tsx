import ServiceShell from "./ServiceShell";
import SocialTileGrid from "@/components/visuals/SocialTileGrid";
import { SECTION_4_SOCIAL } from "@/lib/copy";

export default function SocialSection() {
  return (
    <ServiceShell
      id="social"
      number="04 / Social Media"
      copy={SECTION_4_SOCIAL}
      visual={<SocialTileGrid />}
      background="ink"
      from="right"
      visualSide="right"
    />
  );
}
