#!/bin/sh
# Installs dave-x, or updates it, for this user only: no sudo, and nothing outside ~/.dave-x.
# It brings its own Node, so the machine needs neither Node nor npm.
#   curl -fsSL https://dave-pi-nine.vercel.app/install.sh | sh
set -eu

HOME_DIR="$HOME/.dave-x"
NODE_DIR="$HOME_DIR/node"
NODE_LINE="latest-v22.x"

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "dave-x supports macOS and Linux." >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac

mkdir -p "$HOME_DIR/bin"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Node, checked against the release's published checksums
curl -fsSL "https://nodejs.org/dist/$NODE_LINE/SHASUMS256.txt" -o "$tmp/sums"
line="$(grep " node-v[0-9.]*-$os-$arch.tar.gz\$" "$tmp/sums")"
file="${line##* }"
if [ "$(cat "$NODE_DIR/.release" 2>/dev/null)" != "$file" ]; then
  echo "Downloading Node ($file)"
  curl -fsSL "https://nodejs.org/dist/$NODE_LINE/$file" -o "$tmp/$file"
  if command -v sha256sum >/dev/null; then sum="$(sha256sum "$tmp/$file")"; else sum="$(shasum -a 256 "$tmp/$file")"; fi
  [ "${sum%% *}" = "${line%% *}" ] || { echo "Node download failed its checksum." >&2; exit 1; }
  rm -rf "$NODE_DIR"
  mkdir -p "$NODE_DIR"
  tar -xzf "$tmp/$file" -C "$NODE_DIR" --strip-components 1
  echo "$file" > "$NODE_DIR/.release"
fi

echo "Installing dave-x"
PATH="$NODE_DIR/bin:$PATH" "$NODE_DIR/bin/npm" install --prefix "$HOME_DIR/app" --no-audit --no-fund --no-update-notifier --loglevel error @allenz5/dave-x@latest

cat > "$HOME_DIR/bin/dave-x" <<EOF
#!/bin/sh
exec "$NODE_DIR/bin/node" "$HOME_DIR/app/node_modules/@allenz5/dave-x/src/cli.mjs" "\$@"
EOF
chmod 755 "$HOME_DIR/bin/dave-x"

echo "Installed: $HOME_DIR/bin/dave-x"
