# Real-world acceptance: Mario 64 in Minecraft

## Prerequisites

- Minecraft **Java Edition 1.21.4** installed and started once through Minecraft Launcher. Bedrock alone is insufficient.
- A user-owned **Super Mario 64 USA `.z64`** ROM with SHA-1 `9bef1128717f958171a4afac3ed78ee2bb4e86ce`.
- Git, Bash, Python 3, Java 21, GCC and Make. On Windows x64, install Git for Windows and use **Download build tools** for the other dependencies, or select existing portable compiler, Python, and Java directories. Other platforms use guided tool selection.

## Test procedure

1. Start the launcher and verify that Minecraft Launcher and Java Edition appear as separate discovery rows. If Java 1.21.4 is missing, use **Open Minecraft Launcher** to install and run that version through the official launcher. If Java 1.21.4 is installed in a custom location, use **Choose Minecraft directory** to select its root game directory, the one containing `versions/`.
2. Confirm the 2009 Modern Warfare 2 installation is identified by Steam AppID `10180`. A Call of Duty HQ installation alone must not appear as Modern Warfare II (2022).
3. Choose the locally owned SM64 ROM. An unsupported checksum must display the expected and detected SHA-1 values; a supported one is marked validated.
4. Close Minecraft Launcher completely, then select **Install mashup**. Review the exact upstream script, release tag, and commit. Resolve any missing build tools (or use **Download build tools** on Windows x64), then choose **Run reviewed script**. The Run button stays disabled while Minecraft Launcher is open because it can overwrite profile changes.
5. Confirm installer output shows a successful upstream build and Fabric Loader installation, then confirms downloading the upstream `mario64mc` JAR and Fabric API for 1.21.4.
6. Inspect the managed `game-mashup-mario64` directory inside the selected Minecraft game directory. It should contain `mods/fabric-api-*.jar`, `mods/mario64mc-*.jar`, `config/mario64/baserom.us.z64`, and `config/mario64/sm64.dll`. The upstream mod checks for this filename on every OS, even when the compiled library was named `libsm64.so` or `libsm64.dylib`. The root Minecraft launcher profile file should contain `game-mashup-mario64` with `gameDir` pointed at that isolated instance and `lastVersionId` pointed at Fabric Loader for 1.21.4.
7. Verify the app says **Ready to Play**. Select **Play**; Minecraft Launcher should open with the managed profile selected. Press Play there, sign in normally if asked, enter a single-player world, and press **M** to become Mario. Movement, model, and audio should come from the upstream mod.

## Current machine observation (2026-10-07)

The development machine's Steam manifests and multiplayer files confirm **Call of Duty: Modern Warfare 2 (2009), AppID 10180**. The launcher installed the upstream 2010 Rust Rewrite Mashup `v0.4.0` ZIP after verifying SHA-256 `f7c02cfb4dd5650be29762947a0b17d3e6f9b9f1259025ee89a99bd031e1ebca`. Its executable started, found the Steam MW2 root, downloaded Minecraft assets from Mojang, and opened `minecraft:overworld`. A live window showed the MW2 class menu and, after selecting a class, a UMP45 in the block world. This verifies the MW2 mashup gameplay path on Windows x64. The new launcher card still needs an in-app UI check.

The official Minecraft Launcher is signed in and has installed Java 1.21.4. The Mario Fabric mod, Fabric API, native library, and validated ROM have been installed in a managed instance. The Minecraft launcher profile has since pointed to a different instance, so the current Mario Play flow and in-game activation need a fresh end-to-end check.

The [desktop build workflow for commit `65b12ad`](https://github.com/xavierloeraflores/game-mashup-proto/actions/runs/37612161752) passed 11 tests and produced Windows portable, macOS DMG, and Linux AppImage artifacts on native runners. The Windows package includes the archive extractor. A local smoke launch of the unsigned packaged executable was blocked by this machine's application-control policy; source-mode Electron testing and the managed-tools execution test passed. Packaged startup and native gameplay remain unverified, especially on macOS and Linux.
