import { statfs } from 'node:fs/promises';
import { SyncError } from './sync.mjs';

// The deployed Docker volumes and app overlay share the VPS root filesystem.
export function capacityGuard(
  pool,
  { databaseLimit = 10 * 1024 ** 3, minimumFree = 1024 ** 3, space = () => statfs('/') } = {},
) {
  let checkedAt = 0;
  return async () => {
    if (Date.now() - checkedAt < 5000) return;
    const [disk, result] = await Promise.all([
      space(),
      pool.query('SELECT pg_database_size(current_database()) AS bytes'),
    ]);
    if (
      Number(disk.bavail) * Number(disk.bsize) < minimumFree ||
      Number(result.rows[0].bytes) >= databaseLimit
    )
      throw new SyncError(503, 'service_capacity_exceeded');
    checkedAt = Date.now();
  };
}
