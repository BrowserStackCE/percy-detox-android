#!/usr/bin/env bash
# Verifies the Android build prerequisites before Gradle runs, so a missing
# JDK or SDK fails with a clear message instead of a cryptic Gradle error.
set -uo pipefail

fail=0
err() { echo "✗ $*" >&2; fail=1; }

# Java 17
if [ -z "${JAVA_HOME:-}" ]; then
  err "JAVA_HOME is not set. Install JDK 17 and export it, e.g.:
    macOS: export JAVA_HOME=\$(/usr/libexec/java_home -v 17)
    Linux: export JAVA_HOME=/usr/lib/jvm/java-17-openjdk"
elif [ ! -x "$JAVA_HOME/bin/java" ]; then
  err "JAVA_HOME=$JAVA_HOME has no bin/java. Point it at a JDK 17 install."
else
  version_line=$("$JAVA_HOME/bin/java" -version 2>&1 | head -n 1)
  major=$(echo "$version_line" | sed -E 's/.*version "([0-9]+).*/\1/')
  if [ "$major" != "17" ]; then
    err "JAVA_HOME points to Java $major ($JAVA_HOME). This build requires Java 17.
    macOS: export JAVA_HOME=\$(/usr/libexec/java_home -v 17)
    (if that still resolves to another version, install JDK 17 first, e.g. brew install --cask zulu@17)"
  else
    echo "✓ Java 17 ($JAVA_HOME)"
  fi
fi

# Android SDK
if [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  err "ANDROID_SDK_ROOT is not exported (required even for BrowserStack cloud runs), e.g.:
    macOS: export ANDROID_SDK_ROOT=~/Library/Android/sdk
    Linux: export ANDROID_SDK_ROOT=~/Android/Sdk"
elif [ ! -d "$ANDROID_SDK_ROOT" ]; then
  err "ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT does not exist. Point it at your Android SDK."
else
  echo "✓ Android SDK ($ANDROID_SDK_ROOT)"
fi

if [ "$fail" -ne 0 ]; then
  echo "Environment check failed. Fix the above and re-run." >&2
  exit 1
fi
