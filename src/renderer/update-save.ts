// Keep a failed unmounted editor's save callback until its pending data is saved.
const pendingEditors = new Set<() => Promise<void>>();
export function registerUpdateSave(save: () => Promise<void>) {
  pendingEditors.add(save);
  return () => {
    void save()
      .then(() => pendingEditors.delete(save))
      .catch(() => {});
  };
}
export async function saveBeforeUpdate() {
  await Promise.all([...pendingEditors].map((save) => save()));
}
