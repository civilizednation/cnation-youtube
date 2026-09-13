# Third-party components

This repository contains original application code and references separately distributed open-source packages. Dependency license files are installed with npm or pip; they are not replaced by this notice.

- Next.js, React, TypeScript, Vercel SDKs: see each package's included LICENSE and package metadata.
- yt-dlp: [official repository and license](https://github.com/yt-dlp/yt-dlp). Installed in the disposable Sandbox using pip.
- imageio-ffmpeg: [official repository](https://github.com/imageio/imageio-ffmpeg). Supplies the FFmpeg binary inside the Sandbox. FFmpeg binary licensing depends on the build and enabled components.
- FFmpeg: [official legal and licensing information](https://ffmpeg.org/legal.html). Review the applicable build's LGPL/GPL terms before redistributing binaries or offering a modified distribution.
- Deno: [official repository and license](https://github.com/denoland/deno). Downloaded from the official release and checked against the release SHA-256 checksum.
- Playwright: development-only browser testing tools.

The source ZIP does not bundle downloaded video, Chrome, Deno, FFmpeg executables, node_modules, or private credentials. The application is not an official YouTube or Vercel product.
