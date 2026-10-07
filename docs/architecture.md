# Architecture and registry protocol

The Electron renderer uses a sandboxed preload bridge. It cannot access the filesystem or start processes directly. The main process owns discovery, settings, downloads, build execution, launcher-profile edits, and verification. `src/core` contains the portable logic and is exercised with Node tests.

## Canonical IDs and providers

`registry/games.yaml` lists canonical game IDs separately from store titles. `registry/mashups.yaml` declares status, dependencies, and an installer identifier. The loader validates referenced IDs. Adding an unavailable or experimental mashup needs only a new YAML entry; the desktop library renders those entries automatically. A runnable integration additionally needs an installer implementation for its declared `installer` ID.

The `GameProvider` contract is `discover(game: GameMetadata): Promise<GameInstallation[]>`. Four providers exist:

- `SteamProvider` reads library folders and `appmanifest_<AppID>.acf`, and verifies the install directory.
- `MinecraftLauncherProvider` inspects standard Windows, macOS, and Linux Java directories and launcher profiles. A usable Java version requires its version manifest and vanilla JAR. Windows checks the normal `%APPDATA%\.minecraft` location and the Microsoft Store launcher's data location. A launcher or Bedrock package alone does not satisfy Java Edition.
- `ManualProvider` reads explicit per-game directory overrides. For Minecraft, it enumerates installed vanilla versions rather than treating a directory alone as sufficient.
- `CrossOverSteamProvider` scans Steam inside CrossOver bottles on macOS.

The two Modern Warfare titles are distinct. The local user's 2009 game is Steam AppID `10180`. The 2022 entry considers standalone AppID `3595230` and legacy campaign AppID `1962660`; a Call of Duty HQ (`1938090`) manifest is only evidence when it contains an MWII DLC marker. HQ or Warzone alone is not treated as Modern Warfare II. See the [2009 Steam listing](https://store.steampowered.com/app/10180/Call_of_Duty_Modern_Warfare_2/) and [2022 Steam listing](https://store.steampowered.com/app/3595230/Call_of_Duty_Modern_Warfare_II/).

## Mario installation

The integration declares `minecraft-java` version `1.21.4`, `super-mario-64`, asset `sm64-us-rom`, Fabric Loader `>=0.16.10`, Fabric API for `1.21.4`, and Git/Python/compiler build tools. The ROM is a local asset; SHA-1 must match `9bef1128717f958171a4afac3ed78ee2bb4e86ce`, as documented in the [upstream requirements](https://github.com/Zckyy/mario64-in-minecraft#requirements). It is never fetched or uploaded.

Install performs these stages:

1. Verify Minecraft Java 1.21.4 and the selected ROM.
2. Read the [latest upstream release](https://github.com/Zckyy/mario64-in-minecraft/releases) and clone that release tag into launcher data. Show the exact `scripts/build-libsm64.sh` and source commit for explicit approval. Check Git, Bash, Python 3, GCC/Make, and Java 21. Chosen compiler, Python, and Java directories are prepended to child-process PATH only; the launcher never edits global PATH.
3. Execute the reviewed script with captured stdout/stderr. Reject a changed source commit or script hash. Confirm the built library exists.
4. Use the [official Fabric metadata API](https://meta.fabricmc.net/) and official Maven installer to install a compatible stable loader for 1.21.4. Create a dedicated Minecraft Launcher profile with the managed game directory.
5. Download the upstream release JAR and a matching [Fabric API](https://modrinth.com/mod/fabric-api/versions?g=1.21.4&l=fabric) release. Cache them and place them in the managed instance. Copy the locally verified ROM and native library into `config/mario64`.
6. Write `installation.json` recording repository, release tag, URL, date, installed version, local SHA-256, Fabric versions, source commit, instance path, and profile ID. Verify all required files, profile metadata, and ROM checksum before showing Ready to Play.

The managed instance is under Electron's `app.getPath('userData')/minecraft-instances/mario64`. The installer writes only its own profile key and managed instance files; it does not clear unrelated Minecraft mods. Reinstalling into the same instance replaces its own files but leaves unrelated files present. The ROM source path is saved only in local launcher settings so it can be revalidated; the copied ROM stays in the managed instance. Neither is sent to a server.

The upstream project says to enter a single-player world and press **M** to activate Mario. See its [installation and controls](https://github.com/Zckyy/mario64-in-minecraft#installation).

## Current limits

- The Minecraft Launcher owns sign-in and entitlement checks. The desktop app opens the selected profile there; the user presses Play inside Minecraft Launcher. Direct game launch is not implemented because the official launcher does not expose a verified profile launch command to this prototype.
- The upstream native mod is documented as tested on Windows x64. The script names Linux/macOS outputs, but those platforms still require end-to-end validation.
- Upstream has not published a verified MW2 mashup package. The registry keeps that concept unavailable rather than inventing a repository.
- Tool dependencies use guided installation. The launcher does not download or modify global Git, Python, Java, or compiler installations.
