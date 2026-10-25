# Nexlet 账号与同步服务

独立 Node.js 24 + Better Auth + PostgreSQL 17 服务。与其他应用使用不同数据库用户、卷和网络。客户端默认地址为 `https://161.33.217.59:8443/nexlet`，进程只通过 Docker 映射到 `127.0.0.1:3201`，由已有 Nginx HTTPS 入口代理；不占用 443。

## 配置与运行

生产目录 `/opt/nexlet`。`.env` 仅 root 可读，不进入 Git 或客户端包：

```dotenv
POSTGRES_PASSWORD=<random>
DATABASE_URL=postgresql://nexlet:<password>@db:5432/nexlet
PUBLIC_URL=https://161.33.217.59:8443/nexlet
BETTER_AUTH_SECRET=<32-byte-or-longer-random-secret>
SYNC_ENCRYPTION_KEY=<base64-encoded-32-random-bytes>
GITHUB_CLIENT_ID=<OAuth application client ID>
GITHUB_CLIENT_SECRET=<OAuth application secret>
PORT=3201
NODE_ENV=production
```

GitHub OAuth 回调必须精确配置为 `PUBLIC_URL/auth/callback/github`，不启用通配符。客户端使用的是 Better Auth 的 Device Authorization，不需要开启 GitHub 自身的 Device Flow。OAuth 仅请求用户身份和邮箱，不需要仓库权限。

```sh
docker compose build
docker compose up -d
curl --fail http://127.0.0.1:3201/nexlet/health
```

`loginConfigured: false` 表示服务可运行但尚未配置 GitHub；不应对用户宣称真实登录已经可用。启用前配置凭据并完成真实登录回调检查。修改环境后 `docker compose up -d --force-recreate app`；不要重建或清理数据库卷。

启动使用 Better Auth 官方迁移接口和附加同步表迁移。服务 API 只接受 Bearer 会话，忽略客户端 owner；每个读写都使用验证后的用户 ID。同步正文通过 AES-256-GCM 加密，AAD 包含用户、类别、ID 和版本。保持 `SYNC_ENCRYPTION_KEY` 稳定，否则旧数据无法读取。

同步是单条乐观并发写入，单用户行锁分配递增版本；冲突返回现值。mutation ID 记录保留 30 天；超过期限的旧重试仍会受到 baseRevision 检查。删除标记不自动过期，游标不由客户端时间决定。正文配额 100 MiB，最多 10000 条记录；单条普通内容 1 MiB、图片 8 MiB，请求 12 MiB，拉取分页 50 条／约 10 MiB。Nginx 不记录此路径访问日志，服务错误日志不输出正文或凭据。

新增同步写入前检查总数据库大小与文件系统余量：数据库达到 10 GiB 或可用空间小于 1 GiB 时返回 503，成功检查最多缓存 5 秒。当前部署确认 app overlay 与数据库卷都位于 VPS 根分区；迁移到不同磁盘时须调整容量检查位置。已有本地内容、读取、退出和账号删除仍保留。

## 检查、备份和回滚

`test/integration.test.mjs` 只允许数据库名为 `nexlet_test`，覆盖真实鉴权、设备代码、隔离、冲突、幂等、配额、撤销和删除。使用 `verify-restore.sh` 在明确命名的测试数据库之间进行加密数据备份／恢复，成功后删除测试数据库；不对生产库运行测试清理。

`backup.sh` 已作为 `/etc/cron.daily/nexlet-backup` 运行，每天保存 `pg_dump -Fc`，保留 7 天。备份位置 `/var/backups/nexlet`，密钥配置另存为 root-only `service.env`。每日备份与数据库在同一台 VPS；部署时另做了一次离机复制，保存在本机 `C:/Users/11368/.nexlet-backups/oracle/`，仅当前用户和 SYSTEM 可读。未来的每日备份尚未自动离机复制。用户删除账号后，在线数据和会话立即删除，备份中的旧副本依保留期淘汰。

恢复时先停止 app、备份当前数据库，再把选定 dump 恢复到新数据库，使用对应的加密密钥验证后切换 `DATABASE_URL`。不要直接覆盖唯一生产副本。

`activate-route.py` 只向已有 8443 server 添加 `snippets/nexlet.conf`，先备份再运行 `nginx -t`，失败恢复原配置。撤回服务时停止 `app`，移除该 include 并检查／reload Nginx；保留数据库卷和备份。其他服务、监听端口和 Git 远端不受该流程管理。
