// Browser data transports. Every request settles, including scripts that load
// successfully but never invoke their JSONP callback.
export const REQUEST_TIMEOUT = 6000;

export async function fetchJson(url, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`数据请求失败 (${response.status})`);
        return response.json();
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('数据请求超时'));
        }, timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function loadScript(url, read = () => undefined, timeout = REQUEST_TIMEOUT) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || !document.body) {
      reject(new Error('无浏览器环境'));
      return;
    }
    const script = document.createElement('script');
    let timer;
    const finish = (error, value) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      script.remove();
      if (error) reject(error);
      else resolve(value);
    };
    script.src = url;
    script.async = true;
    script.onload = () => {
      try { finish(null, read()); }
      catch (error) { finish(error); }
    };
    script.onerror = () => finish(new Error('数据加载失败'));
    timer = setTimeout(() => finish(new Error('数据请求超时')), timeout);
    document.body.appendChild(script);
  });
}

// Legacy feeds write a fixed global. Read it within onload and serialize only
// feeds sharing that global, so concurrent funds cannot steal each other's data.
const scriptQueues = new Map();
export function readGlobalScript(url, name) {
  const previous = scriptQueues.get(name) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    window[name] = undefined;
    try {
      return await loadScript(url, () => {
        const value = window[name];
        if (value == null) throw new Error('数据源未返回有效数据');
        return value;
      });
    } finally {
      window[name] = undefined;
    }
  });
  scriptQueues.set(name, task);
  task.finally(() => {
    if (scriptQueues.get(name) === task) scriptQueues.delete(name);
  }).catch(() => {});
  return task;
}

let callbackSequence = 0;
export async function fetchJsonp(url) {
  const callback = `fundCallback_${Date.now()}_${++callbackSequence}`;
  let received = false;
  let result;
  window[callback] = (value) => { received = true; result = value; };
  try {
    return await loadScript(`${url}&callback=${callback}`, () => {
      if (!received) throw new Error('数据源未返回有效数据');
      return result;
    });
  } finally {
    delete window[callback];
  }
}
