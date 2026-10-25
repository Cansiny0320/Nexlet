#!/bin/sh
set -eu
umask 077
cd /opt/nexlet
target=/var/backups/nexlet
mkdir -p "$target"
stamp=$(date -u +%Y%m%d-%H%M%S)
docker compose exec -T db pg_dump -U nexlet -d nexlet -Fc > "$target/$stamp.dump.tmp"
mv "$target/$stamp.dump.tmp" "$target/$stamp.dump"
# The encryption key is necessary for restoration. Keep this separate, root-only.
install -m 600 .env "$target/service.env"
find "$target" -maxdepth 1 -name '*.dump' -type f -mtime +7 -delete
