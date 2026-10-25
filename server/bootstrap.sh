#!/bin/sh
set -eu
umask 077
mkdir -p /opt/nexlet
cd /opt/nexlet
tar -xzf /tmp/nexlet-server-upload.tar.gz
if [ ! -f .env ]; then
  python3 - <<'PY'
import secrets, pathlib, base64
password=secrets.token_hex(32)
values={
 'POSTGRES_PASSWORD':password,
 'DATABASE_URL':'postgresql://nexlet:'+password+'@db:5432/nexlet',
 'PUBLIC_URL':'https://161.33.217.59:8443/nexlet',
 'BETTER_AUTH_SECRET':secrets.token_hex(32),
 'SYNC_ENCRYPTION_KEY':base64.b64encode(secrets.token_bytes(32)).decode(),
 'GITHUB_CLIENT_ID':'', 'GITHUB_CLIENT_SECRET':'', 'PORT':'3201', 'NODE_ENV':'production',
}
pathlib.Path('.env').write_text(''.join(k+'='+v+'\n' for k,v in values.items()))
PY
fi
chmod 600 .env
docker compose build
docker compose up -d
docker compose exec -T db psql -U nexlet -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='nexlet_test'" | grep -q 1 || docker compose exec -T db createdb -U nexlet nexlet_test
docker compose exec -T app node -e 'const {spawnSync}=require("node:child_process");const u=new URL(process.env.DATABASE_URL);u.pathname="/nexlet_test";const r=spawnSync(process.execPath,["--test","test/integration.test.mjs"],{stdio:"inherit",env:{...process.env,DATABASE_URL:u.href}});process.exit(r.status??1)'
