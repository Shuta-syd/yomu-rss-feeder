#!/bin/sh
set -eu
# Chrome listens on its loopback; only the private Docker network sees this relay.
socat TCP-LISTEN:9223,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:9222 &
exec chromium --headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu --no-first-run --no-default-browser-check --user-data-dir=/profile --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --window-size=1280,1000 about:blank
