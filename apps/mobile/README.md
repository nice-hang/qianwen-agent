# Mobile

React Native / Expo client for Qianwen Agent.

## Local Run

The project assumes the local machine already has Android and iOS tooling.

```bash
pnpm --filter @qianwen-agent/server start
pnpm --filter @qianwen-agent/mobile android
pnpm --filter @qianwen-agent/mobile ios
```

`pnpm --filter @qianwen-agent/mobile android` starts a standalone Android emulator when no
device is connected, configures `adb reverse` for Metro, and opens Expo Go. Set
`ANDROID_AVD=Medium_Phone` to choose a specific emulator, or `EXPO_PORT=8082` to use a
different Metro port.

The mobile app uses `http://10.0.2.2:3001` on Android emulator and `http://localhost:3001` on iOS simulator by default.
