#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_ROOT="${ROOT_DIR}/.render/chrome"
VERSION_FILE="${INSTALL_ROOT}/VERSION"
LATEST_RELEASE_URL="https://storage.googleapis.com/chrome-for-testing-public/LATEST_RELEASE_STABLE"

mkdir -p "${INSTALL_ROOT}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to install Chrome for Testing." >&2
  exit 1
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required to install Chrome for Testing." >&2
  exit 1
fi

VERSION="$(curl -fsSL "${LATEST_RELEASE_URL}")"
if [[ -z "${VERSION}" ]]; then
  echo "Unable to determine the latest Chrome for Testing version." >&2
  exit 1
fi

ARCHIVE_NAME="chrome-linux64.zip"
DOWNLOAD_URL="https://storage.googleapis.com/chrome-for-testing-public/${VERSION}/linux64/${ARCHIVE_NAME}"
ARCHIVE_PATH="${INSTALL_ROOT}/${ARCHIVE_NAME}"
TARGET_DIR="${INSTALL_ROOT}/chrome-linux64"
CHROME_BINARY="${TARGET_DIR}/chrome"

if [[ -x "${CHROME_BINARY}" && -f "${VERSION_FILE}" && "$(cat "${VERSION_FILE}")" == "${VERSION}" ]]; then
  echo "Chrome for Testing ${VERSION} already installed."
  exit 0
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "Downloading Chrome for Testing ${VERSION}..."
curl -fsSL "${DOWNLOAD_URL}" -o "${ARCHIVE_PATH}"
rm -rf "${TARGET_DIR}"
unzip -q "${ARCHIVE_PATH}" -d "${INSTALL_ROOT}"
rm -f "${ARCHIVE_PATH}"

if [[ ! -x "${CHROME_BINARY}" ]]; then
  echo "Chrome binary was not found after extraction." >&2
  exit 1
fi

chmod +x "${CHROME_BINARY}"
printf "%s" "${VERSION}" > "${VERSION_FILE}"
"${CHROME_BINARY}" --version
