'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useViewportBreakpoint } from './lib/viewportBreakpoint';
import { NavMenu, SECTION_LINKS, scrollToSection } from './NavMenu';

/** Nav bar breakpoint: at/above this width show inline links; below, collapse to a toggle. */
const NAV_BREAKPOINT_PX = 860;

export function NavBar() {
  const isMobile = useViewportBreakpoint(NAV_BREAKPOINT_PX);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLinkClick = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    scrollToSection(id);
  };

  return (
    <nav className="relative flex items-center justify-between border-b border-[#1A2026] px-6 py-5">
      <Link
        href="/"
        className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[#E7EDF2]"
      >
        Neural<span className="text-[#7FD1FF]">Grid</span>
      </Link>

      {!isMobile && (
        <div className="flex items-center gap-6 font-[family-name:var(--font-display)]">
          {SECTION_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={handleLinkClick(link.id)}
              className="text-sm text-[#8B96A1] transition-colors hover:text-[#E7EDF2]"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        {!isMobile && (
          <Link
            href="/login"
            className="rounded-md bg-[#7FD1FF] px-4 py-2 text-sm font-semibold text-[#0A0D10] transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
        )}
        {isMobile && (
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[#212930] text-[#E7EDF2] transition-colors hover:bg-[#12171C]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {menuOpen ? (
                <>
                  <line x1="4" y1="4" x2="14" y2="14" />
                  <line x1="14" y1="4" x2="4" y2="14" />
                </>
              ) : (
                <>
                  <line x1="3" y1="5" x2="15" y2="5" />
                  <line x1="3" y1="9" x2="15" y2="9" />
                  <line x1="3" y1="13" x2="15" y2="13" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>

      {isMobile && menuOpen && <NavMenu onLinkActivate={() => setMenuOpen(false)} />}
    </nav>
  );
}
