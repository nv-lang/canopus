#!/usr/bin/env bash
set -euo pipefail
: "${NOVA_HOME:?Set NOVA_HOME to the installed Nova distribution}"
export NOVA_STD_PATH="$NOVA_HOME/std"
export NOVA_CG_INCLUDE="$NOVA_HOME"
export NOVA_RT_DIR="$NOVA_HOME/nova_rt"
export NOVA_GC_LIB_DIR="$NOVA_HOME/gc/lib"
export NOVA_GC_INCLUDE_DIR="$NOVA_HOME/gc/include"
case "${1:-targeted}" in
  targeted) "$NOVA_HOME/nova.exe" test src/server/delivery_test.nv --jobs 1 ;;
  full)
    node --test --test-concurrency=4 'src/web/test/*.test.mjs'
    "$NOVA_HOME/nova.exe" test src/acp src/server src/server_live --jobs 4
    bash scripts/guards/run-all.sh
    ;;
esac
