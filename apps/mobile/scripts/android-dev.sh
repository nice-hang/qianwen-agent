#!/usr/bin/env bash
set -euo pipefail

EXPO_PORT="${EXPO_PORT:-8081}"
EXPO_HOST="${EXPO_HOST:-10.0.2.2}"
SERVER_PORT="${SERVER_PORT:-3001}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXPO_BIN="${EXPO_BIN:-${APP_DIR}/node_modules/.bin/expo}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
ADB="${ANDROID_SDK_ROOT}/platform-tools/adb"
EMULATOR="${ANDROID_SDK_ROOT}/emulator/emulator"

cd "$APP_DIR"

if [[ ! -x "$EXPO_BIN" ]]; then
  echo "Cannot find Expo CLI at $EXPO_BIN"
  echo "Run pnpm install first, or set EXPO_BIN to the Expo CLI path."
  exit 1
fi

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

is_metro_ready() {
  curl -fsS "http://127.0.0.1:${1}/status" 2>/dev/null | grep -q "packager-status:running"
}

is_port_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

pick_expo_port() {
  local port="$EXPO_PORT"

  for _ in $(seq 1 10); do
    if is_metro_ready "$port" || ! is_port_listening "$port"; then
      echo "$port"
      return
    fi
    echo "Port $port is occupied by a non-responsive process; trying $((port + 1))." >&2
    port=$((port + 1))
  done

  echo "No available Expo port found near $EXPO_PORT." >&2
  exit 1
}

wait_for_metro() {
  local port="$1"
  local attempts=60

  until is_metro_ready "$port"; do
    attempts=$((attempts - 1))
    if [[ "$attempts" -le 0 ]]; then
      echo "Metro did not become ready on port $port." >&2
      exit 1
    fi
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

EXPO_PORT="$(pick_expo_port)"
"$ADB" reverse "tcp:${EXPO_PORT}" "tcp:${EXPO_PORT}" >/dev/null 2>&1 || true
"$ADB" reverse "tcp:${SERVER_PORT}" "tcp:${SERVER_PORT}" >/dev/null 2>&1 || true

"$EXPO_BIN" start --port "$EXPO_PORT" --localhost --clear &
EXPO_PID="$!"

trap 'kill "$EXPO_PID" >/dev/null 2>&1 || true' EXIT INT TERM

wait_for_metro "$EXPO_PORT"
"$ADB" reverse "tcp:${EXPO_PORT}" "tcp:${EXPO_PORT}" >/dev/null 2>&1 || true
"$ADB" reverse "tcp:${SERVER_PORT}" "tcp:${SERVER_PORT}" >/dev/null 2>&1 || true
"$ADB" shell am start \
  -a android.intent.action.VIEW \
  -d "exp://${EXPO_HOST}:${EXPO_PORT}" \
  host.exp.exponent/.LauncherActivity >/dev/null 2>&1 || true

wait "$EXPO_PID"
