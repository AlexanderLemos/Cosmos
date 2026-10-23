#!/usr/bin/env bash
# Ephemeral runtime path mapping: Debian WebKit embeds /usr/lib child-process paths.
# Does not change the host /usr, and keeps the checkout read-only during execution.
set -euo pipefail
. /workspace/.cosmos-tools/env.sh
exec bwrap --ro-bind / / --dev /dev \
  --bind /workspace/.cosmos-tools /workspace/.cosmos-tools \
  --bind /tmp /tmp \
  --overlay-src /usr/lib/x86_64-linux-gnu --tmp-overlay /usr/lib/x86_64-linux-gnu \
  --ro-bind /workspace/.cosmos-tools/sysroot/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1 /usr/lib/x86_64-linux-gnu/webkit2gtk-4.1 \
  xvfb-run -a "$@"
