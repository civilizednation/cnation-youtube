/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/*": ["bin/**/*"],
  },
};

module.exports = nextConfig;
