/** Bound the caller as well as the transport; late failures are consumed. */
export class LabDeadlineError extends Error {
  constructor() { super("Model Lab request deadline reached"); this.name = "LabDeadlineError"; }
}

export async function withinLabDeadline<T>(deadline: number, operation: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  if (Date.now() >= deadline) throw new LabDeadlineError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new LabDeadlineError());
      }, Math.max(1, deadline - Date.now()));
      Promise.resolve().then(() => operation(controller.signal)).then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
  }
}
