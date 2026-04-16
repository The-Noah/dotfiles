#!/usr/bin/env bash

set -euo pipefail

echo "Updating system..."
sudo pacman -Syu --noconfirm

if ! command -v yay &> /dev/null; then
  echo "Installing yay..."
  sudo pacman -S --needed --noconfirm yay-bin
else
  echo "yay is already installed."
fi

is_installed() {
  pacman -Qi "$1" &> /dev/null
}

packages=(
  htop
  btop
  7zip
  fzf
  bat
  wget
  curl
  eza
  ffmpeg
  jq
  ufw
  tar
  gzip
  xz
  zstd
  brotli
  ripgrep
  rsync
  nano
  nvtop
  lazygit
  lazydocker
  impala
  bluetui
  tailscale

  firefox-developer-edition
  1password
  kitty
  yazi
  fish
  starship
  git
  git-lfs
  github-cli
  zed
  msedit
  obsidian
  discord

  rust
  nodejs
  npm
  pnpm
  python
  python-pip
  ansible
  terraform
  bruno-bin
  docker
  docker-compose
  docker-buildx
  playwright
  claude-code
  opencode

  wayland
  hyprland
  hyprlock
  hypridle
  hyprcursor
  hypremoji
  hyprpaper
  hyprpicker
  hyprshot
  hyprmon-bin
  waybar
  walker
  swaync
  nwg-look
  mpvpaper
  noto-fonts
  noto-fonts-emoji
)

to_install=()

for pkg in "${packages[@]}"; do
  if ! is_installed "$pkg"; then
    to_install+=("$pkg")
  fi
done

if [ ${#to_install[@]} -gt 0 ]; then
  echo "Installing ${to_install[*]}..."
  yay -S --noconfirm "${to_install[@]}"
else
  echo "All packages are already installed."
fi
