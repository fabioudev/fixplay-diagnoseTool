// Generates the Tauri v2 updater manifest (latest.json) from a directory of
// release assets (bundles + their .sig files). Run in the release CI job after
// all bundle artifacts are downloaded into one folder.
//
//   node scripts/generate-latest-json.mjs <assetsDir> <version> [outputPath]
//
// Platform mapping (graceful — a platform is omitted if its bundle or .sig is
// missing, so a release that only built some targets still yields a valid
// manifest):
//   linux-x86_64   <- *<version>*amd64.AppImage  + .AppImage.sig
//   windows-x86_64 <- *_x64-setup.exe (nsis)     + .exe.sig
//
// The `signature` field is the *content* of the .sig file (not a URL), as the
// Tauri updater requires. `url` points at the GitHub release asset download.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'fabioudev/fixplay-diagnoseTool';
const RELEASE_BASE = `https://github.com/${REPO}/releases/download`;

const assetsDir = process.argv[2];
const version = process.argv[3]?.replace(/^v/, '');
const outputPath = process.argv[4];
if (!assetsDir || !version) {
  console.error('usage: generate-latest-json.mjs <assetsDir> <version> [outputPath]');
  process.exit(1);
}

const files = readdirSync(assetsDir);
const find = (re) => files.find((f) => re.test(f));
const sigOf = (bundleName) => {
  // Tauri emits <bundle>.sig next to the bundle.
  const sig = files.find((f) => f === `${bundleName}.sig`);
  return sig ? readFileSync(join(assetsDir, sig), 'utf8').trim() : null;
};
const urlFor = (name) => `${RELEASE_BASE}/v${version}/${name}`;

const platforms = {};

// Linux: AppImage + its .sig
const appimage = find(new RegExp(`.+_${escapeRegex(version)}_amd64\\.AppImage$`));
if (appimage) {
  const signature = sigOf(appimage);
  if (signature) platforms['linux-x86_64'] = { signature, url: urlFor(appimage) };
  else console.warn(`[latest.json] linux AppImage found (${appimage}) but no .sig — skipping`);
}

// Windows: prefer nsis -setup.exe + .sig (falls back to .msi.zip if present)
const nsisExe = find(/.+_x64-setup\.exe$/);
const msiZip = find(/.+_x64[^.]*\.msi\.zip$/);
const winBundle = nsisExe ?? msiZip;
if (winBundle) {
  const signature = sigOf(winBundle);
  if (signature) platforms['windows-x86_64'] = { signature, url: urlFor(winBundle) };
  else console.warn(`[latest.json] windows bundle found (${winBundle}) but no .sig — skipping`);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const manifest = {
  version,
  notes: '',
  pub_date: new Date().toISOString(),
  platforms,
};

const json = JSON.stringify(manifest, null, 2);
if (outputPath) {
  writeFileSync(outputPath, json + '\n', 'utf8');
  console.log(`[latest.json] written to ${outputPath} — platforms: ${Object.keys(platforms).join(', ') || '(none)'}`);
} else {
  console.log(json);
}