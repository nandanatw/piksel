#!/usr/bin/env bash
# One-time dependencies for running Kreasya on a Debian/Ubuntu VPS.
# Run as root (or with sudo).
set -euo pipefail

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates fonts-liberation libnss3 libatk-bridge2.0-0 libatk1.0-0 \
  libcups2 libdrm2 libgbm1 libasound2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgtk-3-0 libpango-1.0-0 libcairo2 libx11-xcb1 \
  libxcb-dri3-0 libxshmfence1

# 2GB VPS: add a 2G swapfile so Postgres + Node + (sporadic) Chromium do not OOM
# the box and take down other projects (e.g. bandelbanget.shop).
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'Swap enabled (2G).'
fi

# NOTE: the renoise-cli binary must be a Linux ELF executable at /opt/kreasya/renoise-cli
# (or set RENOISE_CLI_PATH in .env). The macOS Mach-O build shipped in this repo
# will NOT run on Linux.
