const fs = require("fs");
const path = require("path");

const BIN_DIR = path.join(__dirname, "..", "bin");
const YT_DLP_PATH = path.join(BIN_DIR, "yt-dlp");

async function main() {
  fs.mkdirSync(BIN_DIR, { recursive: true });

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = { "User-Agent": "cnation-youtube-downloader" };
  if (token) headers.Authorization = `Bearer ${token}`;

  console.log("[prepare-bin] Fetching latest yt-dlp release metadata...");
  const releaseRes = await fetch(
    "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
    { headers }
  );
  if (!releaseRes.ok) {
    const body = await releaseRes.text();
    throw new Error(`GitHub release lookup failed: ${releaseRes.status} ${body}`);
  }
  const release = await releaseRes.json();
  // yt-dlp_linux is the standalone PyInstaller build with Python bundled in;
  // the plain "yt-dlp" asset is a Python zipapp that needs a system python3,
  // which Vercel's Node runtime doesn't have.
  const asset = release.assets.find((a) => a.name === "yt-dlp_linux");
  if (!asset) throw new Error("Could not find yt-dlp_linux binary in latest release");

  console.log(
    `[prepare-bin] Downloading yt-dlp ${release.tag_name} from ${asset.browser_download_url}`
  );
  const binRes = await fetch(asset.browser_download_url);
  if (!binRes.ok) throw new Error(`yt-dlp binary download failed: ${binRes.status}`);

  const buffer = Buffer.from(await binRes.arrayBuffer());
  fs.writeFileSync(YT_DLP_PATH, buffer);
  fs.chmodSync(YT_DLP_PATH, 0o755);

  const stat = fs.statSync(YT_DLP_PATH);
  console.log(
    `[prepare-bin] Wrote ${YT_DLP_PATH} (${stat.size} bytes, mode ${(stat.mode & 0o777).toString(8)})`
  );
}

main().catch((err) => {
  console.error("[prepare-bin] FAILED:", err);
  process.exit(1);
});
