#!/bin/sh
# Optional local Node distribution; no global PATH/config changes or downloads.
set -eu
cd "$(dirname "$0")"
if [ -x .runtime/bin/node ]; then
  PATH="$PWD/.runtime/bin:$PATH"
  export PATH
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Node.js 24 LTS と付属の npm を導入してください。手順: _tests/README.md' >&2
  exit 1
fi
exec npm "$@"
