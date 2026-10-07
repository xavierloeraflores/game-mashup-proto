# Real-world acceptance tests

## Mario 64 in Minecraft

### Prerequisites

- Minecraft **Java Edition 1.21.4** installed and started once through Minecraft Launcher. Bedrock alone is insufficient.
- A user-owned **Super Mario 64 USA `.z64`** ROM with SHA-1 `9bef1128717f958171a4afac3ed78ee2bb4e86ce`.
- Git, Bash, Python 3, Java 21, GCC and Make. On Windows x64, install Git for Windows and use **Download build tools** for the other dependencies, or select existing portable compiler, Python, and Java directories. Other platforms use guided tool selection.

### Test procedure

1. Start the launcher on the **Library** page, verify that Minecraft Launcher and Java Edition appear as separate discovery rows, then open **Mario 64 in Minecraft**. If Java 1.21.4 is missing, use **Open Minecraft Launcher** to install and run that version through the official launcher. If Java 1.21.4 is installed in a custom location, use **Choose Minecraft directory** to select its root game directory, the one containing `versions/`.
2. Choose the locally owned SM64 ROM. An unsupported checksum must display the expected and detected SHA-1 values; a supported one is marked validated.
3. Close Minecraft Launcher completely, then select **Install mashup**. Review the exact upstream script, release tag, and commit. Resolve any missing build tools (or use **Download build tools** on Windows x64), then choose **Run reviewed script**. The Run button stays disabled while Minecraft Launcher is open because it can overwrite profile changes.
4. Confirm installer output shows a successful upstream build and Fabric Loader installation, then confirms downloading the upstream `mario64mc` JAR and Fabric API for 1.21.4.
5. Inspect the managed `game-mashup-mario64` directory inside the selected Minecraft game directory. It should contain `mods/fabric-api-*.jar`, `mods/mario64mc-*.jar`, `config/mario64/baserom.us.z64`, and `config/mario64/sm64.dll`. The upstream mod checks for this filename on every OS, even when the compiled library was named `libsm64.so` or `libsm64.dylib`. The root Minecraft launcher profile file should contain `game-mashup-mario64` with `gameDir` pointed at that isolated instance and `lastVersionId` pointed at Fabric Loader for 1.21.4.
6. Verify the app says **Ready to Play**. Select **Play**; Minecraft Launcher should open with the managed profile selected. Press Play there, sign in normally if asked, enter a single-player world, and press **M** to become Mario. Movement, model, and audio should come from the upstream mod.

## MW2 (2009) × Minecraft world

1. On Windows x64, install the Steam MW2 (2009) multiplayer files. Confirm the app finds AppID `10180` and does not confuse it with MWII (2022). Open **Minecraft world in MW2 (2009)** from the Library and check its setup list.
2. On the MW2 page, select **Install mashup**. The app downloads the upstream IW4L `v0.4.0` ZIP and checks its pinned SHA-256 before extracting it into launcher data. Steam game files are left in place.
3. Select **Play Minecraft world**. On first use, allow the upstream runtime to fetch Minecraft assets from Mojang. Its window should reach `minecraft:overworld` and show an MW2 class selection.
4. Select a class. Confirm that MW2 weapons, HUD, and movement work in the generated Minecraft world. The app's `npm run doctor -- --data-root <launcher-data>` should report `MW2 (2009) multiplayer files: true` and `MW2 mashup installed: true`.

## Current machine observation (2026-10-07)

The development machine's Steam manifests and multiplayer files confirm **Call of Duty: Modern Warfare 2 (2009), AppID 10180**. The installer downloaded the upstream 2010 Rust Rewrite Mashup `v0.4.0` ZIP after verifying SHA-256 `f7c02cfb4dd5650be29762947a0b17d3e6f9b9f1259025ee89a99bd031e1ebca`. Its executable started, found the Steam MW2 root, downloaded Minecraft assets from Mojang, and opened `minecraft:overworld`. A live window showed the MW2 class menu and, after selecting a class, a UMP45 in the block world. With the redesigned client, the app's **Play Minecraft world** button also launched IW4L and reached the Minecraft world and class selection screen.

The official Minecraft Launcher is signed in and has installed Java 1.21.4. The Mario Fabric mod, Fabric API, native library, and validated ROM are installed in the managed `.minecraft/game-mashup-mario64` instance. The app's **Play** action repaired the Fabric profile and opened Minecraft Launcher with **Mario 64 in Minecraft** selected. After pressing Play there, the live Java process used the managed Fabric version, managed game directory, and isolated mod list. In a single-player world, **M** activated Mario: the model and power HUD appeared, the music started, and the log recorded `libsm64 initialised` from the managed ROM. No manual ROM copy was needed. The app's status stayed on its previous scan until refreshed; the Play handler now refreshes it after opening the Launcher.

The [desktop build workflow for commit `65b12ad`](https://github.com/xavierloeraflores/game-mashup-proto/actions/runs/37612161752) passed 11 tests and produced Windows portable, macOS DMG, and Linux AppImage artifacts on native runners. The Windows package includes the archive extractor. A local smoke launch of the unsigned packaged executable was blocked by this machine's application-control policy; source-mode Electron testing and the managed-tools execution test passed. Packaged startup and native gameplay remain unverified, especially on macOS and Linux.
