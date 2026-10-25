#!/bin/sh
set -eu
umask 077
cd /opt/nexlet
mkdir -p /var/backups/nexlet
docker compose exec -T app node -e 'const {spawnSync}=require("node:child_process");const u=new URL(process.env.DATABASE_URL);u.pathname="/nexlet_test";const r=spawnSync(process.execPath,["test/restore-fixture.mjs","seed"],{stdio:"inherit",env:{...process.env,DATABASE_URL:u.href}});process.exit(r.status??1)'
docker compose exec -T db pg_dump -U nexlet -d nexlet_test -Fc > /var/backups/nexlet/restore-check.dump
docker compose exec -T db createdb -U nexlet nexlet_restore
docker compose exec -T db pg_restore -U nexlet -d nexlet_restore --no-owner < /var/backups/nexlet/restore-check.dump
docker compose exec -T app node -e 'const {spawnSync}=require("node:child_process");const u=new URL(process.env.DATABASE_URL);u.pathname="/nexlet_restore";const r=spawnSync(process.execPath,["test/restore-fixture.mjs","verify"],{stdio:"inherit",env:{...process.env,DATABASE_URL:u.href}});process.exit(r.status??1)'
docker compose exec -T db dropdb -U nexlet nexlet_restore
docker compose exec -T db dropdb -U nexlet nexlet_test
echo 'Isolated restore verification completed; temporary databases removed'
