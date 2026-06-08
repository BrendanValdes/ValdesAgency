import ServiceShell from "./ServiceShell";
import SocialTileGrid from "@/components/visuals/SocialTileGrid";
import { SECTION_CONTENT } from "@/lib/copy";

export default function ContentSystemSection() {
  return (
    <ServiceShell
      id="content-system"
      copy={SECTION_CONTENT}
      visual={<SocialTileGrid />}
      background="ink"
      from="right"
      visualSide="right"
    />
  );
}
