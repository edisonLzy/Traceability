/**
 * 纯校验函数 —— 无 DOM 依赖，便于单测枚举各 case。
 *
 * 约定：返回 `string` 为错误提示文案，返回 `null` 表示校验通过。
 * 入参均为原始值，函数内部自行做 trim / 大小写归一化。
 */

export type FieldError = string | null;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

/** 一次性邮箱域名黑名单（大小写不敏感，比较前会先小写化）。 */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
]);

/** 用户名：字母开头，仅字母/数字/下划线，长度 3–20。 */
export function validateUsername(raw: string): FieldError {
  const value = raw.trim();
  if (value.length === 0) return "用户名不能为空";
  if (value.length < USERNAME_MIN) return `用户名至少 ${USERNAME_MIN} 个字符`;
  if (value.length > USERNAME_MAX) return `用户名最多 ${USERNAME_MAX} 个字符`;
  if (!/^[A-Za-z]/.test(value)) return "用户名必须以字母开头";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) return "用户名只能包含字母、数字和下划线";
  return null;
}

/** 邮箱：trim + 小写化后校验格式与 TLD，并屏蔽一次性域名。 */
export function validateEmail(raw: string): FieldError {
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return "邮箱不能为空";
  if (/\s/.test(value)) return "邮箱不能包含空格";
  if (value.indexOf("@") !== value.lastIndexOf("@")) return "邮箱只能包含一个 @";
  // [^\s@]+@[^\s@]+\.[^\s@]{2,} —— 本地段 @ 域名 . TLD(≥2)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return "邮箱格式不正确";
  const domain = value.split("@")[1] ?? "";
  if (DISPOSABLE_DOMAINS.has(domain)) return "请使用非一次性邮箱";
  return null;
}

/** 密码：长度 8–64，含大小写/数字/特殊符号，无空白。 */
export function validatePassword(raw: string): FieldError {
  if (raw.length === 0) return "密码不能为空";
  if (raw.length < PASSWORD_MIN) return `密码至少 ${PASSWORD_MIN} 个字符`;
  if (raw.length > PASSWORD_MAX) return `密码最多 ${PASSWORD_MAX} 个字符`;
  if (/\s/.test(raw)) return "密码不能包含空格";
  if (!/[a-z]/.test(raw)) return "密码必须包含小写字母";
  if (!/[A-Z]/.test(raw)) return "密码必须包含大写字母";
  if (!/\d/.test(raw)) return "密码必须包含数字";
  // 非字母数字且非空白即视为特殊符号（下划线 _ 属于 \w，不计入）
  if (!/[^\w\s]/.test(raw)) return "密码必须包含特殊符号";
  return null;
}

/** 确认密码：非空且与密码完全一致。 */
export function validateConfirmPassword(confirm: string, password: string): FieldError {
  if (confirm.length === 0) return "请再次输入密码";
  if (confirm !== password) return "两次输入的密码不一致";
  return null;
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

/** 密码强度：综合长度与字符种类，用于实时强度条。空串记为 weak。 */
export function passwordStrength(raw: string): PasswordStrength {
  if (raw.length === 0) return "weak";
  let score = 0;
  if (raw.length >= 8) score++;
  if (raw.length >= 12) score++;
  if (/[a-z]/.test(raw) && /[A-Z]/.test(raw)) score++;
  if (/\d/.test(raw)) score++;
  if (/[^\w\s]/.test(raw)) score++;
  if (score <= 1) return "weak";
  if (score <= 2) return "fair";
  if (score <= 3) return "good";
  return "strong";
}

/** 归一化：用户名去首尾空格。 */
export function normalizeUsername(raw: string): string {
  return raw.trim();
}

/** 归一化：邮箱去首尾空格并小写化。 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
