# Game Mashup Launcher

A cross-platform desktop prototype for discovering games and installing mashups in managed instances. The first complete integration targets [Mario 64 in Minecraft](https://github.com/Zckyy/mario64-in-minecraft): Minecraft Java 1.21.4, Fabric, a user-owned Super Mario 64 US ROM, and a locally compiled native library.

## Development

Requires Node.js 22 or newer.

```sh
npm install
npm run build
npm test
npm start
```

Build a distributable on the matching operating system with `npm run package:win`, `npm run package:mac`, or `npm run package:linux`. Output goes to `releases/`. The [desktop build workflow](.github/workflows/desktop-build.yml) tests and packages all three platforms when pushed to GitHub. Inspect local discovery without opening the desktop app with `npm run doctor -- --minecraft <path> --rom <path>`; both flags are optional.

The launcher never downloads a ROM or bypasses Minecraft sign-in. Its first integration uses an isolated `game-mashup-mario64` directory inside the selected Minecraft Java directory, with the Fabric profile registered in the official Minecraft Launcher. After validating the user's SM64 US ROM checksum, installation copies it to `game-mashup-mario64/config/mario64/baserom.us.z64` beside the native library; the user does not need to move or rename it. Selecting a valid ROM again repairs a missing installed copy. Existing installations under the launcher's app data are copied into the new location, including saved worlds. [Upstream](https://github.com/Zckyy/mario64-in-minecraft#limitations) has tested the native mod on Windows x64; macOS and Linux native builds are included as experimental paths and need real-game verification. The Play button selects the managed profile and opens Minecraft Launcher; the user then presses Play there to use the launcher's normal authentication.

On Windows x64, **Download build tools** installs checksum-verified portable Python, GCC/Make, and Java 21 into the launcher's data directory. Git for Windows still supplies Git and Bash. The app changes PATH only for its build child processes. Existing portable tool directories can also be selected manually.

See [docs/architecture.md](docs/architecture.md) for the protocol and [docs/acceptance.md](docs/acceptance.md) for the real-world acceptance path.
