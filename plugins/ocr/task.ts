export class RecognitionTask {
  private stop: (() => void) | undefined;
  cancel() { this.stop?.(); }
  run<T>(work: (own: (worker: {terminate(): void}) => void) => Promise<T>, timeout = 60000): Promise<T> {
    this.cancel();
    return new Promise((resolve, reject) => {
      let active = true, worker: {terminate(): void} | undefined;
      const finish = (error?: Error, result?: T) => {
        if (!active) return;
        active = false; clearTimeout(timer); worker?.terminate();
        if (this.stop === cancel) this.stop = undefined;
        error ? reject(error) : resolve(result!);
      };
      const cancel = () => finish(new Error('cancelled'));
      const timer = setTimeout(() => finish(new Error('timeout')), timeout);
      this.stop = cancel;
      Promise.resolve().then(() => work(value => {
        if (!active) { value.terminate(); throw new Error('cancelled'); }
        worker = value;
      })).then(value => finish(undefined, value), error => finish(error));
    });
  }
}
