/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/*": ["node_modules/youtube-dl-exec/bin/**/*"],
  },
};

module.exports = nextConfig;
