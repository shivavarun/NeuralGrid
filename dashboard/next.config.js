/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/jobs',
        destination: '/dashboard/jobs',
        permanent: true,
      },
      {
        source: '/keys',
        destination: '/dashboard/api-keys',
        permanent: true,
      },
      {
        source: '/billing',
        destination: '/dashboard/billing',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
