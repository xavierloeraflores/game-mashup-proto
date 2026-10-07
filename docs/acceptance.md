# Real-world acceptance: Mario 64 in Minecraft

## Prerequisites

- Minecraft **Java Edition 1.21.4** installed and started once through Minecraft Launcher. Bedrock alone is insufficient.
- A user-owned **Super Mario 64 USA `.z64`** ROM with SHA-1 `9bef1128717f958171a4afac3ed78ee2bb4e86ce`.
- Git, Bash, Python 3, Java 21, GCC and Make. On Windows x64, install Git for Windows and use **Download build tools** for the other dependencies, or select existing portable compiler, Python, and Java directories. Other platforms use guided tool selection.

## Test procedure

1. Start the launcher and verify that Minecraft Launcher and Java Edition appear as separate discovery rows. If Java 1.21.4 is missing, use **Open Minecraft Launcher** to install and run that version through the official launcher. If Java 1.21.4 is installed in a custom location, use **Choose Minecraft directory** to select its root game directory, the one containing `versions/`.
2. Confirm the 2009 Modern Warfare 2 installation is identified by Steam AppID `10180`. A Call of Duty HQ installation alone must not appear as Modern Warfare II (2022).
3. Choose the locally owned SM64 ROM. An unsupported checksum must display the expected and detected SHA-1 values; a supported one is marked validated.
4. Select **Install mashup**. Review the exact upstream script, release tag, and commit. Resolve any missing build tools (or use **Download build tools** on Windows x64), then choose **Run reviewed script**.
5. Confirm installer output shows a successful upstream build and Fabric Loader installation, then confirms downloading the upstream `mario64mc` JAR and Fabric API for 1.21.4.
6. Inspect the managed instance under the app's user-data directory. It should contain `mods/fabric-api-*.jar`, `mods/mario64mc-*.jar`, `config/mario64/baserom.us.z64`, and the platform's `sm64.dll`, `libsm64.so`, or `libsm64.dylib`. The root Minecraft launcher profile file should contain `game-mashup-mario64` with `gameDir` pointed at that isolated instance and `lastVersionId` pointed at Fabric Loader for 1.21.4.
7. Verify the app says **Ready to Play**. Select **Play**; Minecraft Launcher should open with the managed profile selected. Press Play there, sign in normally if asked, enter a single-player world, and press **M** to become Mario. Movement, model, and audio should come from the upstream mod.

## Current machine observation (2026-10-07)

The development machine's Steam manifests and installation directory confirm **Call of Duty: Modern Warfare 2 (2009), AppID 10180**. Minecraft Launcher and a Bedrock package are detected, but no usable Java 1.21.4 installation was found in the standard paths. A local SM64 USA ROM was selected in the packaged launcher and validated against the upstream SHA-1. The upstream `mario64mc-0.1.0.jar`, Fabric API `0.119.4+1.21.4`, and official Fabric installer `1.1.2` were fetched to launcher cache and checked where upstream hashes were available. A source-review preflight cloned release `v0.1.0` at commit `681c68531b173ed5422b249e9cdbcecabadf9d63` without executing its build script. The launcher-managed Python, GCC/Make, and Java 21 downloads were extracted and passed the installer's environment checks; the upstream build script was not run. Automated tests cover the edition distinction, metadata, checksums, and verification logic. The full in-game acceptance test remains pending Minecraft Java 1.21.4.

The [desktop build workflow for commit `03162d7`](https://github.com/xavierloeraflores/game-mashup-proto/actions/runs/37610802201) passed tests and produced Windows portable, macOS DMG, and Linux AppImage artifacts on native runners. The Windows package includes the archive extractor. A local smoke launch of the unsigned packaged executable was blocked by this machine's application-control policy; source-mode Electron testing and the managed-tools execution test passed. Packaged startup and native gameplay remain unverified, especially on macOS and Linux.
