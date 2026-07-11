'use client';

import Link from 'next/link';

export interface SectionLink {
  id: string;
  label: string;
}

/** The four Nav_Bar section links, in visual order. Shared with NavBar. */
export const SECTION_LINKS: SectionLink[] = [
  { id: 'problem', label: 'Problem' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'comparison', label: 'Compare' },
];

/** Native smooth-scroll to a section by id; no-op if the section is absent. */
export function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface NavMenuProps {
  /** Called after any section link is activated, so NavBar can close the overlay. */
  onLinkActivate: () => void;
}

export function NavMenu({ onLinkActivate }: NavMenuProps) {
  const handleLinkClick = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    scrollToSection(id);
    onLinkActivate();
  };

  return (
    <div
      className="absolute left-0 right-0 top-full z-50 flex flex-col gap-1 border-b border-[#1A2026] bg-[#0A0D10] px-6 py-4 font-[family-name:var(--font-display)]"
    >
      {SECTION_LINKS.map((link) => (
        <a
          key={link.id}
          href={`#${link.id}`}
          onClick={handleLinkClick(link.id)}
          className="rounded-md px-2 py-2 text-sm text-[#8B96A1] transition-colors hover:bg-[#12171C] hover:text-[#E7EDF2]"
        >
          {link.label}
        </a>
      ))}
      <Link
        href="/login"
        className="mt-2 rounded-md bg-[#7FD1FF] px-4 py-2 text-center text-sm font-semibold text-[#0A0D10] transition-opacity hover:opacity-90"
      >
        Get started
      </Link>
    </div>
  );
}
