import lock from '../../assets/system-actions/lock.png';
import sleep from '../../assets/system-actions/sleep.png';
import restart from '../../assets/system-actions/restart.png';
import shutdown from '../../assets/system-actions/shutdown.png';
import logout from '../../assets/system-actions/logout.png';
import desktop from '../../assets/system-actions/desktop.png';

export const systemActionIcons: Readonly<Partial<Record<string, string>>> = {
  lock, sleep, restart, shutdown, logout, desktop
};
