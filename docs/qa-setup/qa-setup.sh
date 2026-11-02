#!/bin/sh
# 사용법: sh docs/qa-setup/qa-setup.sh <프로토콜 폴더>
node "$(dirname "$0")/merge-protocol.cjs" "$1"
