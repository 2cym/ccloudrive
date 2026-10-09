/**
 * 前端 fetch 封装。
 *
 * 统一处理：
 * - 自动 JSON 序列化/反序列化
 * - 非 2xx 自动 toast 错误
 * - 返回结构 { ok, data, error }
 */

type ApiError = { code: string; message: string; field?: string };
type ApiSuccess<T> = { ok: true; data: T; error?: undefined };
type ApiFailure = { ok: false; data?: undefined; error: ApiError };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

// 在服务端调用时无 toast，故用可选的 toast 参数
let defaultToast: ((message: string) => void) | null = null;

export function setApiToast(toast: (message: string) => void) {
  defaultToast = toast;
}

class ApiClient {
  constructor(private toast?: (message: string) => void) {}

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {};
    const init: RequestInit = { method, credentials: 'include' };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    init.headers = headers;

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : '网络错误';
      this.notify(msg);
      return { ok: false, error: { code: 'NETWORK_ERROR', message: msg } };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      const msg = `服务器返回异常 (${response.status})`;
      this.notify(msg);
      return { ok: false, error: { code: 'PARSE_ERROR', message: msg } };
    }

    const result = json as ApiResult<T>;
    if (!response.ok || !result.ok) {
      const msg = result.error?.message ?? `请求失败 (${response.status})`;
      this.notify(msg);
      return {
        ok: false,
        error: result.error ?? { code: 'UNKNOWN', message: msg },
      };
    }

    return { ok: true, data: result.data as T };
  }

  private notify(message: string) {
    const notifyFn = this.toast ?? defaultToast;
    if (typeof window !== 'undefined' && notifyFn) {
      notifyFn(message);
    }
  }

  get<T>(url: string) {
    return this.request<T>('GET', url);
  }
  post<T>(url: string, body: unknown) {
    return this.request<T>('POST', url, body);
  }
  patch<T>(url: string, body: unknown) {
    return this.request<T>('PATCH', url, body);
  }
  delete<T>(url: string, body?: unknown) {
    return this.request<T>('DELETE', url, body);
  }
}

export const api = new ApiClient();

export function createApiClient(toast?: (message: string) => void) {
  return new ApiClient(toast);
}
