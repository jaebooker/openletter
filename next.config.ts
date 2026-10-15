import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'postgres', 'nodemailer'],
  poweredByHeader: false,
};

export default config;
