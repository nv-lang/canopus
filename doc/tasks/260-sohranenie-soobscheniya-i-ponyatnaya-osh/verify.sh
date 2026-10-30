#!/usr/bin/env bash
set -euo pipefail
: "${NOVA_HOME:?Set NOVA_HOME to the installed Nova distribution}"
export NOVA_STD_PATH="$NOVA_HOME/std"
export NOVA_CG_INCLUDE="$NOVA_HOME"
export NOVA_RT_DIR="$NOVA_HOME/nova_rt"
export NOVA_GC_LIB_DIR="$NOVA_HOME/gc/lib"
export NOVA_GC_INCLUDE_DIR="$NOVA_HOME/gc/include"
guards() {
  bash scripts/guards/run-all.sh
  source scripts/guards/lib/find-python.sh
  find_python
  $PYTHON scripts/guards/guard-secrets.py --tree
  $PYTHON scripts/guards/guard-commit-message.py --commit HEAD
}
case "${1:-targeted}" in
  targeted) "$NOVA_HOME/nova.exe" test src/server_live/delivery_test.nv --jobs 1 --timeout 300 ;;
  server) "$NOVA_HOME/nova.exe" test src/acp src/server src/server_live --jobs 1 --timeout 900 ;;
  final)
    node --test --test-concurrency=4 'src/web/test/*.test.mjs'
    node src/web/test/delivery-browser.mjs "$2" "$3"
    guards
    "$NOVA_HOME/nova.exe" test src/server_live/delivery_test.nv --jobs 1 --timeout 300
    ;;
  full)
    node --test --test-concurrency=4 'src/web/test/*.test.mjs'
    "$NOVA_HOME/nova.exe" build src/crew_hub.nv -o target/crew-hub.exe
    "$NOVA_HOME/nova.exe" test src/acp src/server src/server_live --jobs 1 --timeout 900
    guards
    ;;
esac
