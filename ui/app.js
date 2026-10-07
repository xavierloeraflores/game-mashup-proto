const $ = id => document.getElementById(id);
let state;
let reviewedCommit;

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
  const requirementList = $('requirements');
  requirementList.replaceChildren();
  const minecraft = data.gameRequirements.find(item => item.id === 'minecraft-java');
  const mcDetail = minecraft?.satisfied ? 'Java Edition 1.21.4 found' : minecraft?.installed ? 'Java Edition found, but version 1.21.4 is missing' : data.minecraft.bedrockDetected ? 'Minecraft was detected, but this mashup requires Minecraft: Java Edition.' : 'Minecraft Java Edition not found';
  row(requirementList, 'Minecraft: Java Edition 1.21.4', mcDetail, !!minecraft?.satisfied);
  row(requirementList, 'Super Mario 64 US ROM', data.installedRomValid ? 'Validated ROM in managed instance' : data.romValid ? 'Validated SHA-1; stays on this computer' : data.romError || 'Your own .z64 file is required', data.romValid || data.installedRomValid);
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

  const future = $('future-mashups');
  future.replaceChildren();
  for (const mashup of data.registry.mashups.filter(item => item.id !== 'mario64-in-minecraft')) {
    const item = document.createElement('div');
    item.className = 'future';
    const description = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = mashup.name;
    const summary = document.createElement('p');
    summary.textContent = mashup.description;
    description.append(title, summary);
    const badge = document.createElement('span');
    badge.className = 'status-badge muted';
    badge.textContent = mashup.status.toUpperCase();
    item.append(description, badge);
    future.append(item);
  }

  $('play').disabled = !data.ready;
  $('managed-tools').hidden = !data.managedToolsAvailable;
  const badge = $('ready-badge');
  badge.textContent = data.ready ? 'READY TO PLAY' : 'SETUP NEEDED';
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
    $('missing-guidance').hidden = missing.length === 0;
    $('missing-guidance').textContent = missing.length ? `Install the missing tools, then reopen this review:\n${missing.join('\n')}` : '';
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
    notice('Installation verified. Open the selected profile in Minecraft Launcher, enter a single-player world, and press M to become Mario.');
  } finally { $('install').disabled = false; }
}));
$('play').addEventListener('click', () => action(async () => notice(await window.launcher.play())));
action(refresh);
