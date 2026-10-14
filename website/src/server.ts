import startHandler, { createServerEntry } from '@tanstack/react-start/server-entry';
export default createServerEntry({
  fetch(request, options) {
    return startHandler.fetch(request, options);
  },
});
