import HeroSection from "@/components/sections/HeroSection";
import WhoItsForSection from "@/components/sections/WhoItsForSection";
import WebsitesSection from "@/components/sections/WebsitesSection";
import SocialSection from "@/components/sections/SocialSection";
import FunnelSection from "@/components/sections/FunnelSection";
import CRMSection from "@/components/sections/CRMSection";
import AITeamSection from "@/components/sections/AITeamSection";
import CommandCenterSection from "@/components/sections/CommandCenterSection";
import ReportsSection from "@/components/sections/ReportsSection";
import SynergySection from "@/components/sections/SynergySection";
import Footer from "@/components/sections/Footer";

/**
 * Full 10-section homepage composition + footer.
 * Sections 7 + 10 currently use CSS+FM fallback visuals. Will upgrade
 * to R3F + Higgsfield atmospheric backdrops after Brendan approves
 * Credit 1 + Credit 2 prompts.
 */
export default function Home() {
  return (
    <main>
      <HeroSection />
      <WhoItsForSection />
      <WebsitesSection />
      <SocialSection />
      <FunnelSection />
      <CRMSection />
      <AITeamSection />
      <CommandCenterSection />
      <ReportsSection />
      <SynergySection />
      <Footer />
    </main>
  );
}
