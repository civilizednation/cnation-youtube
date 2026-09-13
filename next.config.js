/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/download": ["./node_modules/youtube-dl-exec/bin/**"],
    "/api/info": ["./node_modules/youtube-dl-exec/bin/**"],
  },
};

module.exports = nextConfig;
