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

The launcher never downloads a ROM or bypasses Minecraft sign-in. The Mario integration's upstream native build has only been tested on Windows x64; the app reports the other platforms as unsupported for this particular integration while its discovery and registry work across Windows, macOS, and Linux.

See [docs/architecture.md](docs/architecture.md) for the protocol and [docs/acceptance.md](docs/acceptance.md) for the real-world acceptance path.
