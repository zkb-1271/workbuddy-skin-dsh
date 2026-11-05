#!/bin/bash
# dsh-skin · 卸载：停守护进程、撤环境变量、还原原生界面
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
bash "$ROOT/tools/uninstall-daemon.sh"
