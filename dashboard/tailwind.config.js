/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // ng-* brand colors (preserved for landing page)
        'ng-bg': '#0a0a0f',
        'ng-surface': '#111116',
        'ng-accent-violet': '#7c3aed',
        'ng-accent-cyan': '#7FD1FF',
        'ng-tier-1': '#3DDC97',
        'ng-tier-2': '#F5A623',
        'ng-tier-3': '#FF5470',
        // shadcn CSS-variable colors
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      backgroundImage: {
        'ng-hero-gradient': 'radial-gradient(circle at 50% 20%, rgba(124,58,237,0.25), transparent 60%), radial-gradient(circle at 80% 80%, rgba(34,211,238,0.15), transparent 55%)',
        'ng-section-gradient': 'linear-gradient(180deg, #0a0a0f 0%, #111116 100%)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
