// 轻量入参校验 — 不信任来自 renderer / HTTP 的输入
// 桌面端 IPC 与 Web 路由共用；抛出的 ValidationError 带 code，便于上层映射成友好提示。

export class ValidationError extends Error {
  code = 'INVALID_INPUT';
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export function isValidationError(e: unknown): e is ValidationError {
  return e instanceof ValidationError || (e as any)?.name === 'ValidationError';
}

interface StringOptions {
  min?: number;
  max?: number;
  trim?: boolean;
  /** 允许空字符串 */
  allowEmpty?: boolean;
}

export function requireString(value: unknown, field: string, opts: StringOptions = {}): string {
  if (typeof value !== 'string') {
    throw new ValidationError(field, `${field} 必须是字符串`);
  }
  const result = opts.trim === false ? value : value.trim();
  if (!opts.allowEmpty && result.length === 0) {
    throw new ValidationError(field, `${field} 不能为空`);
  }
  if (opts.min !== undefined && result.length < opts.min) {
    throw new ValidationError(field, `${field} 长度不得少于 ${opts.min}`);
  }
  if (opts.max !== undefined && result.length > opts.max) {
    throw new ValidationError(field, `${field} 长度不得超过 ${opts.max}`);
  }
  if (result.includes('\u0000')) {
    throw new ValidationError(field, `${field} 含非法字符`);
  }
  return result;
}

export function optionalString(value: unknown, field: string, opts: StringOptions = {}): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, field, opts);
}

interface NumberOptions {
  min?: number;
  max?: number;
  integer?: boolean;
}

export function requireNumber(value: unknown, field: string, opts: NumberOptions = {}): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(field, `${field} 必须是有效数字`);
  }
  if (opts.integer && !Number.isInteger(value)) {
    throw new ValidationError(field, `${field} 必须是整数`);
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new ValidationError(field, `${field} 不得小于 ${opts.min}`);
  }
  if (opts.max !== undefined && value > opts.max) {
    throw new ValidationError(field, `${field} 不得大于 ${opts.max}`);
  }
  return value;
}

export function optionalNumber(value: unknown, field: string, opts: NumberOptions = {}): number | undefined {
  if (value === undefined || value === null) return undefined;
  return requireNumber(value, field, opts);
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new ValidationError(field, `${field} 必须是布尔值`);
  return value;
}

export function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ValidationError(field, `${field} 只能是 ${allowed.join(' / ')} 之一`);
  }
  return value as T;
}

export function requireArray(value: unknown, field: string, opts: { min?: number; max?: number } = {}): unknown[] {
  if (!Array.isArray(value)) throw new ValidationError(field, `${field} 必须是数组`);
  const min = opts.min ?? 0;
  const max = opts.max ?? 1000;
  if (value.length < min) throw new ValidationError(field, `${field} 至少需要 ${min} 项`);
  if (value.length > max) throw new ValidationError(field, `${field} 最多允许 ${max} 项`);
  return value;
}

/**
 * 校验「工作区内的相对/绝对路径」形态：
 * 只做形态层面的把关（类型、空字节、长度），真正的越界判断由 file.ipc 的
 * isInWorkspace / isPathSafe 负责（那里才知道授权了哪些目录）。
 */
export function requirePath(value: unknown, field = 'path'): string {
  const p = requireString(value, field, { max: 4096 });
  if (/[\u0000-\u001f]/.test(p)) {
    throw new ValidationError(field, `${field} 含控制字符`);
  }
  return p;
}
