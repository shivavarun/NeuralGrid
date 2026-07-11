import './globals.css';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import { ReactNode } from 'react';

const displayFont = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' });
const monoFont = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata = {
  title: 'NeuralGrid — Automatic GPU Tier Routing on AMD Developer Cloud',
  description: 'NeuralGrid profiles every job and routes it to the smallest AMD Instinct partition that can run it. Same output. Lower bill.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`dark ${displayFont.variable} ${monoFont.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
