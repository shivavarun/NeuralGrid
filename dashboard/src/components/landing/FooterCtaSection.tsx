import Link from 'next/link';

const GITHUB_URL = 'https://github.com/neuralgrid/neuralgrid';

export function FooterCtaSection() {
  return (
    <footer className="bg-[#0A0D10] px-6 py-20 text-center text-white">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Ready to stop overpaying?</h2>
        <p className="mb-8 text-[#8B96A1]">
          Route your next job to the cheapest GPU that can handle it.
        </p>

        <Link
          href="/login"
          className="inline-block rounded-full bg-ng-accent-violet px-8 py-3 font-semibold text-white transition hover:opacity-90"
        >
          Create your free account
        </Link>

        <div className="mt-12 border-t border-[#212930] pt-8 font-[family-name:var(--font-mono)] text-sm text-[#8B96A1]">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-white"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
