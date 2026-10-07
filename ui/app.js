const $ = id => document.getElementById(id);
let state;
let reviewedCommit;
const pages = ['library', 'mario', 'mw2'];

function showPage() {
  const page = location.hash.slice(1);
  const active = pages.includes(page) ? page : 'library';
  for (const name of pages) $('page-' + name).hidden = name !== active;
  for (const link of document.querySelectorAll('[data-nav]')) {
    const selected = link.dataset.nav === active;
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  $('page-label').textContent = active === 'library' ? 'LIBRARY' : active === 'mario' ? 'MARIO 64 IN MINECRAFT' : 'MINECRAFT WORLD IN MW2';
  document.title = `${active === 'library' ? 'Library' : active === 'mario' ? 'Mario 64 in Minecraft' : 'Minecraft world in MW2'} · Game Mashup Launcher`;
  notice('');
  window.scrollTo(0, 0);
}

function status(label, ready, muted = false) {
  const badge = document.createElement('span');
  badge.className = `status-badge${ready ? ' ready' : muted ? ' muted' : ''}`;
  badge.textContent = label;
  return badge;
}

function card(container, { name, description, page, icon, platform, label, ready, muted }) {
  const item = document.createElement('article');
  item.className = `mashup-card${page === 'mw2' ? ' mw2-card' : ''}`;
  const top = document.createElement('div');
  top.className = 'card-top';
  const symbol = document.createElement('span');
  symbol.className = 'card-icon';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = icon;
  top.append(symbol, status(label, ready, muted));
  const heading = document.createElement('h2');
  heading.textContent = name;
  const summary = document.createElement('p');
  summary.textContent = description;
  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const support = document.createElement('span');
  support.className = 'card-platform';
  support.textContent = platform;
  const link = document.createElement(page ? 'a' : 'span');
  link.className = page ? 'card-link' : 'card-platform';
  if (page) {
    link.href = '#' + page;
    link.textContent = 'View details →';
    link.setAttribute('aria-label', `View ${name} details`);
  } else link.textContent = 'DETAILS COMING LATER';
  footer.append(support, link);
  item.append(top, heading, summary, footer);
  container.append(item);
}

function notice(message) {
  const element = $('notice');
  element.textContent = message || '';
  element.classList.toggle('show', !!message);
}

function row(container, title, detail, ok) {
  const item = document.createElement('div');
  item.className = 'row';
  const mark = document.createElement('span');
  mark.className = `mark${ok ? ' ok' : ''}`;
  mark.textContent = ok ? '✓' : '!';
  const text = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const sub = document.createElement('small');
  sub.textContent = detail;
  text.append(heading, sub);
  item.append(mark, text);
  container.append(item);
}

function render(data) {
  state = data;
  const cards = $('library-cards');
  cards.replaceChildren();
  card(cards, {
    name: 'Mario 64 in Minecraft', description: 'Play as SM64 Mario in a Minecraft Java single-player world.', page: 'mario', icon: 'M',
    platform: 'MINECRAFT JAVA · FABRIC',
    label: data.ready ? 'READY TO PLAY' : data.romRepairable || data.profileRepairable ? 'REPAIR READY' : 'SETUP NEEDED',
    ready: data.ready,
  });
  card(cards, {
    name: 'Minecraft world in MW2 (2009)', description: 'Explore a generated Minecraft world with MW2 weapons.', page: 'mw2', icon: '▣',
    platform: 'WINDOWS X64 · STEAM MW2',
    label: data.mw2Ready ? 'READY TO PLAY' : data.mw2Supported ? 'SETUP NEEDED' : 'WINDOWS X64',
    ready: data.mw2Ready, muted: !data.mw2Supported,
  });
  for (const mashup of data.registry.mashups.filter(item => !['mario64-in-minecraft', 'minecraft-mw2'].includes(item.id))) {
    card(cards, { name: mashup.name, description: mashup.description, icon: '✳', platform: 'PLANNED INTEGRATION', label: mashup.status.toUpperCase(), muted: true });
  }
  const requirementList = $('requirements');
  requirementList.replaceChildren();
  const minecraft = data.gameRequirements.find(item => item.id === 'minecraft-java');
  const mcDetail = minecraft?.satisfied ? 'Java Edition 1.21.4 found' : minecraft?.installed ? 'Java Edition found, but version 1.21.4 is missing' : data.minecraft.bedrockDetected ? 'Minecraft was detected, but this mashup requires Minecraft: Java Edition.' : 'Minecraft Java Edition not found';
  row(requirementList, 'Minecraft: Java Edition 1.21.4', mcDetail, !!minecraft?.satisfied);
  row(requirementList, 'Super Mario 64 US ROM', data.installedRomValid ? 'Validated ROM in managed instance' : data.romValid ? 'Validated SHA-1; stays on this computer' : data.romError || 'Your own .z64 file is required', data.romValid || data.installedRomValid);
  const missingTools = Object.entries(data.buildTools).filter(([, ready]) => !ready).map(([name]) => name);
  row(requirementList, 'Build tools', missingTools.length ? `Missing: ${missingTools.join(', ')}` : 'Git, Bash, Python, GCC/Make, and Java 21 ready', missingTools.length === 0);
  const checkNames = ['fabric-profile', 'fabric-api', 'mario-mod', 'native'];
  for (const id of checkNames) {
    const check = data.checks.find(item => item.id === id);
    const titles = { 'fabric-profile': 'Fabric Loader & isolated profile', 'fabric-api': 'Fabric API', 'mario-mod': 'Mario64 Minecraft mod', native: 'Locally built libsm64' };
    row(requirementList, titles[id], check?.ok ? 'Installed in managed instance' : 'Installed during setup', !!check?.ok);
  }

  const games = $('games');
  games.replaceChildren();
  row(games, 'Minecraft Launcher', data.minecraft.launcherInstalled ? 'Launcher found' : 'Launcher not found in standard locations', data.minecraft.launcherInstalled);
  row(games, 'Minecraft: Java Edition', data.minecraft.javaUsable || minecraft?.installed ? `Usable Java installation${minecraft?.satisfied ? ' · 1.21.4 available' : ''}` : data.minecraft.bedrockDetected ? 'Bedrock detected; Java Edition required' : 'No usable Java installation detected', data.minecraft.javaUsable || !!minecraft?.installed);
  for (const game of data.registry.games.filter(item => item.steamAppIds)) {
    const found = data.installations[game.id] || [];
    row(games, game.name, found.length ? `${found[0].details} · ${found[0].path}` : 'Not found in Steam libraries', found.length > 0);
  }

  const mw2Requirements = $('mw2-requirements');
  mw2Requirements.replaceChildren();
  row(mw2Requirements, 'Windows x64', data.mw2Supported ? 'This computer can run the IW4L release' : 'This mashup currently has a Windows x64 release', data.mw2Supported);
  row(mw2Requirements, 'MW2 (2009) multiplayer on Steam', data.mw2FilesReady ? `Found at ${data.mw2Path}` : 'Install the 2009 multiplayer game in Steam, then rescan', data.mw2FilesReady);
  row(mw2Requirements, 'IW4L Minecraft runtime', data.mw2Ready ? 'Installed and verified in launcher data' : 'Installed by this app after the game is found', data.mw2Ready);
  $('mw2-install').disabled = !data.mw2FilesReady || !data.mw2Supported;
  $('mw2-install').textContent = data.mw2Ready ? 'Repair install ↗' : 'Install mashup ↗';
  $('mw2-play').disabled = !data.mw2Ready;
  const mw2Badge = $('mw2-badge');
  mw2Badge.textContent = data.mw2Ready ? 'READY TO PLAY' : data.mw2Supported ? 'SETUP NEEDED' : 'WINDOWS X64';
  mw2Badge.className = `status-badge${data.mw2Ready ? ' ready' : !data.mw2Supported ? ' muted' : ''}`;
  $('mw2-next-step').textContent = !data.mw2Supported ? 'Open this page on a Windows x64 computer to install IW4L.' : !data.mw2FilesReady ? 'Install Call of Duty: Modern Warfare 2 (2009) multiplayer through Steam, then select Rescan games.' : data.mw2Ready ? 'Ready. Choose Play Minecraft world to launch IW4L.' : 'MW2 files found. Choose Install mashup to download and verify IW4L.';

  $('play').disabled = !data.ready && !data.profileRepairable && !data.romRepairable;
  $('play').textContent = data.romRepairable ? 'Repair ROM & open Launcher ▶' : data.profileRepairable ? 'Repair profile & open Launcher ▶' : 'Play ▶';
  $('open-minecraft').disabled = !data.minecraft.launcherInstalled;
  $('managed-tools').hidden = !data.managedToolsAvailable;
  const badge = $('ready-badge');
  badge.textContent = data.ready ? 'READY TO PLAY' : data.romRepairable ? 'ROM REPAIR READY' : data.profileRepairable ? 'PROFILE REPAIR READY' : 'SETUP NEEDED';
  badge.className = `status-badge${data.ready ? ' ready' : ''}`;
  $('install').textContent = data.ready ? 'Reinstall / repair ↗' : 'Install mashup ↗';
}

async function refresh() { render(await window.launcher.snapshot()); }
async function action(fn) {
  try { notice(''); await fn(); }
  catch (error) { notice(error?.message || String(error)); }
}

window.launcher.onLog(line => {
  const log = $('log');
  if (log.textContent === 'Waiting for an installation.') log.textContent = '';
  log.textContent += line;
  if (log.textContent.length > 50000) log.textContent = log.textContent.slice(-50000);
  log.scrollTop = log.scrollHeight;
});

$('refresh').addEventListener('click', () => action(refresh));
$('open-minecraft').addEventListener('click', () => action(async () => notice(await window.launcher.openMinecraftLauncher())));
$('minecraft-path').addEventListener('click', () => action(async () => render(await window.launcher.chooseMinecraft())));
$('rom-path').addEventListener('click', () => action(async () => render(await window.launcher.chooseRom())));
$('toolchain-path').addEventListener('click', () => action(async () => render(await window.launcher.chooseToolchain())));
$('python-path').addEventListener('click', () => action(async () => render(await window.launcher.choosePython())));
$('java-path').addEventListener('click', () => action(async () => render(await window.launcher.chooseJava())));
$('managed-tools').addEventListener('click', () => action(async () => {
  $('managed-tools').disabled = true;
  notice('Downloading checksum-verified Python, GCC/Make, and Java 21 into launcher data.');
  try { render(await window.launcher.installManagedTools()); notice('Build tools are ready in launcher data.'); }
  finally { $('managed-tools').disabled = false; }
}));
$('source').addEventListener('click', () => action(() => window.launcher.openSource()));
$('mw2-source').addEventListener('click', () => action(() => window.launcher.openMw2Source()));
$('mw2-install').addEventListener('click', () => action(async () => {
  $('mw2-install').disabled = true;
  try { render(await window.launcher.installMw2()); notice('MW2 mashup installed. Choose Play Minecraft world to launch it.'); }
  finally { $('mw2-install').disabled = false; }
}));
$('mw2-play').addEventListener('click', () => action(async () => notice(await window.launcher.playMw2())));
$('install').addEventListener('click', () => action(async () => {
  if (!state?.minecraftRoot || !state.gameRequirements.find(item => item.id === 'minecraft-java')?.satisfied) { notice('Install and run Minecraft: Java Edition 1.21.4 in Minecraft Launcher, then choose its .minecraft directory.'); return; }
  if (!state.romValid) { notice('Super Mario 64 ROM required\nThis mashup requires your own Super Mario 64 USA ROM. Choose a .z64 file.'); return; }
  $('install').disabled = true;
  try {
    const review = await window.launcher.prepare();
    reviewedCommit = review.sourceCommit;
    $('script').textContent = review.script;
    $('review-meta').textContent = `${review.source}\nRelease: ${review.releaseTag} · Commit: ${review.sourceCommit}\nScript: ${review.scriptPath}`;
    const checks = $('tool-checks');
    checks.replaceChildren();
    for (const [tool, ready] of Object.entries(review.buildTools)) {
      const tag = document.createElement('span');
      tag.className = ready ? '' : 'missing';
      tag.textContent = `${ready ? '✓' : '✗'} ${tool}`;
      checks.append(tag);
    }
    const instructions = {
      git: 'Git: install from git-scm.com (Git for Windows includes Bash).',
      python: 'Python 3: install from python.org/downloads, then choose its directory in the app.',
      bash: 'Bash: install Git for Windows, or your system Bash package.',
      compiler: 'GCC and Make: on Windows use w64devkit or MinGW and select its bin directory in the app.',
      java: 'Java: install a Java 21 runtime, then choose its bin directory in the app.',
    };
    const missing = Object.entries(review.buildTools).filter(([, ready]) => !ready).map(([tool]) => instructions[tool]);
    if (review.launcherRunning) missing.push('Close Minecraft Launcher completely, then reopen this review. It can overwrite Fabric profiles while running.');
    $('missing-guidance').hidden = missing.length === 0;
    $('missing-guidance').textContent = missing.join('\n');
    $('run-build').disabled = missing.length > 0;
    $('review-overlay').classList.remove('hidden');
  } finally { $('install').disabled = false; }
}));

function closeReview() { $('review-overlay').classList.add('hidden'); reviewedCommit = undefined; }
$('close-review').addEventListener('click', closeReview);
$('cancel-build').addEventListener('click', closeReview);
$('run-build').addEventListener('click', () => action(async () => {
  if (!reviewedCommit) return;
  const commit = reviewedCommit;
  closeReview();
  $('install').disabled = true;
  try {
    const result = await window.launcher.install(commit);
    render(result.state);
    notice('Installation files verified. In Minecraft Launcher, choose “Mario 64 in Minecraft” from the bottom-left installation dropdown, press Play, enter a single-player world, then press M with chat closed.');
  } finally { $('install').disabled = false; }
}));
$('play').addEventListener('click', () => action(async () => {
  const message = await window.launcher.play();
  await refresh();
  notice(message);
}));
window.addEventListener('hashchange', showPage);
showPage();
action(refresh);
