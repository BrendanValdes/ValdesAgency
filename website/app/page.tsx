import HeroSection from "@/components/sections/HeroSection";
import GetFoundSection from "@/components/sections/GetFoundSection";
import BeEverywhereSection from "@/components/sections/BeEverywhereSection";
import NeverMissLeadSection from "@/components/sections/NeverMissLeadSection";
import LeadCaptureSection from "@/components/sections/LeadCaptureSection";
import ContentSystemSection from "@/components/sections/ContentSystemSection";
import CommandCenterSection from "@/components/sections/CommandCenterSection";
import ReportsSection from "@/components/sections/ReportsSection";
import TimelineSection from "@/components/sections/TimelineSection";
import BottomCTASection from "@/components/sections/BottomCTASection";

/**
 * Valdes Agency — "Growth Engine" single-page site.
 * 10 sections, alternating light/dark, hero intake form + bottom CTA.
 */
export default function Home() {
  return (
    <main>
      <HeroSection />
      <GetFoundSection />
      <BeEverywhereSection />
      <NeverMissLeadSection />
      <LeadCaptureSection />
      <ContentSystemSection />
      <CommandCenterSection />
      <ReportsSection />
      <TimelineSection />
      <BottomCTASection />
    </main>
  );
}
