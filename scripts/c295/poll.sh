#!/bin/bash
# CDN 실측: 평소 주소 vs 꼬리 주소의 version.json·index 를 3초마다
B=https://atho3398.github.io/bleach-hollow-Ascension
for i in $(seq 1 ${1:-300}); do
  t=$(TZ=Asia/Seoul date +%H:%M:%S)
  p=$(curl -s -D /tmp/h1 "$B/version.json" | tr -d '\n'); pa=$(grep -i '^age' /tmp/h1 | tr -d '\r\n')
  q=$(curl -s "$B/version.json?t=$RANDOM$i" | tr -d '\n')
  ix=$(curl -s -D /tmp/h2 "$B/" | grep -o 'assets/index-[^"]*\.js' | head -1); ia=$(grep -i '^age' /tmp/h2 | tr -d '\r\n')
  echo "$t plain=$p [$pa] busted=$q index=$ix [$ia]"
  sleep 3
done
