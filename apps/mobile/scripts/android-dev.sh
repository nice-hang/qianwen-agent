#!/usr/bin/env bash
set -euo pipefail

EXPO_PORT="${EXPO_PORT:-8081}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
ADB="${ANDROID_SDK_ROOT}/platform-tools/adb"
EMULATOR="${ANDROID_SDK_ROOT}/emulator/emulator"

if [[ ! -x "$ADB" ]]; then
  echo "Cannot find adb at $ADB"
  echo "Set ANDROID_HOME or ANDROID_SDK_ROOT to your Android SDK path."
  exit 1
fi

if [[ ! -x "$EMULATOR" ]]; then
  echo "Cannot find emulator at $EMULATOR"
  echo "Set ANDROID_HOME or ANDROID_SDK_ROOT to your Android SDK path."
  exit 1
fi

has_device() {
  "$ADB" devices | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit found ? 0 : 1 }'
}

wait_for_boot() {
  "$ADB" wait-for-device

  local boot_completed=""
  until [[ "$boot_completed" == "1" ]]; do
    boot_completed="$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    sleep 1
  done
}

pick_avd() {
  if [[ -n "${ANDROID_AVD:-}" ]]; then
    echo "$ANDROID_AVD"
    return
  fi

  "$EMULATOR" -list-avds | awk 'NF { print; exit }'
}

if ! has_device; then
  AVD_NAME="$(pick_avd)"
  if [[ -z "$AVD_NAME" ]]; then
    echo "No Android device is connected and no AVD exists."
    echo "Create one in Android Studio Device Manager, then rerun npm run android."
    exit 1
  fi

  echo "Starting Android emulator: $AVD_NAME"
  "$EMULATOR" -avd "$AVD_NAME" -no-snapshot-load >/tmp/qianwen-agent-android-emulator.log 2>&1 &
  wait_for_boot
fi

"$ADB" reverse "tcp:${EXPO_PORT}" "tcp:${EXPO_PORT}" >/dev/null 2>&1 || true

(
  sleep 8
  "$ADB" reverse "tcp:${EXPO_PORT}" "tcp:${EXPO_PORT}" >/dev/null 2>&1 || true
  "$ADB" shell am start -a android.intent.action.VIEW -d "exp://localhost:${EXPO_PORT}" >/dev/null 2>&1 || true
) &

exec expo start --android --port "$EXPO_PORT" --localhost
