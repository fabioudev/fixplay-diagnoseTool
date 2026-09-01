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
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const REPO = 'fabioudev/fixplay-diagnoseTool';
const RELEASE_BASE = `https://github.com/${REPO}/releases/download`;

const assetsDir = process.argv[2];
const version = process.argv[3]?.replace(/^v/, '');
const outputPath = process.argv[4];
if (!assetsDir || !version) {
  console.error('usage: generate-latest-json.mjs <assetsDir> <version> [outputPath]');
  process.exit(1);
}

// Collect files RECURSIVELY. `actions/upload-artifact@v4` preserves the
// least-common-ancestor dir of the globbed `path`s (here `target/release/
// bundle/`), so each bundle artifact is a zip with `appimage/`, `nsis/`, …
// subdirs. `download-artifact@v4 --merge-multiple` then extracts them into
// release-assets/ WITH those subdirs intact — a flat `readdirSync(assetsDir)`
// only sees the subdir names and finds no bundles, yielding an empty
// `platforms` map and a silently-broken in-app updater. Walk the tree.
const files = (function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(relative(assetsDir, p));
  }
  return acc;
})(assetsDir, []);
const find = (re) => files.find((f) => re.test(f));
const sigOf = (bundleName) => {
  // Tauri emits <bundle>.sig next to the bundle. Match by basename so it
  // works regardless of which subdir the artifact merge placed it in.
  const want = `${bundleName}.sig`;
  const sig = files.find((f) => f === want || f.endsWith(`/${want}`));
  return sig ? readFileSync(join(assetsDir, sig), 'utf8').trim() : null;
};
// GitHub release asset URLs are flat under /<tag>/<basename> — strip any
// subdir the artifact merge introduced (e.g. `appimage/foo.AppImage` →
// `foo.AppImage`) so the updater downloads from the real asset URL.
const urlFor = (name) => `${RELEASE_BASE}/v${version}/${basename(name)}`;

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
  console.log(
    `[latest.json] written to ${outputPath} — platforms: ${Object.keys(platforms).join(', ') || '(none)'}`
  );
} else {
  console.log(json);
}
