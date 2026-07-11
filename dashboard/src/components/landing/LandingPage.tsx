import { NavBar } from './NavBar';
import { HeroSection } from './HeroSection';
import { ProblemSection } from './ProblemSection';
import { HowItWorksSection } from './HowItWorksSection';
import { AmdCalloutSection } from './AmdCalloutSection';
import { ComparisonSection } from './ComparisonSection';
import { PricingSection } from './PricingSection';
import { FooterCtaSection } from './FooterCtaSection';

export function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0A0D10] text-[#E7EDF2]">
      <NavBar />
      <HeroSection />
      <ProblemSection />
      <HowItWorksSection />
      <AmdCalloutSection />
      <ComparisonSection />
      <PricingSection />
      <FooterCtaSection />
    </main>
  );
}
