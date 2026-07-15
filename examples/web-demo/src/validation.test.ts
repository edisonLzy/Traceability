import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordStrength,
  validateConfirmPassword,
  validateEmail,
  validatePassword,
  validateUsername,
  USERNAME_MAX,
  USERNAME_MIN,
} from "./validation";

describe("validateUsername", () => {
  it("拒绝空与纯空格", () => {
    expect(validateUsername("")).toBe("用户名不能为空");
    expect(validateUsername("   ")).toBe("用户名不能为空");
    expect(validateUsername("\t\n")).toBe("用户名不能为空");
  });

  it("拒绝过短（1–2 个字符）", () => {
    expect(validateUsername("a")).toBe(`用户名至少 ${USERNAME_MIN} 个字符`);
    expect(validateUsername("ab")).toBe(`用户名至少 ${USERNAME_MIN} 个字符`);
  });

  it("拒绝超长（>20）", () => {
    expect(validateUsername("a".repeat(21))).toBe(`用户名最多 ${USERNAME_MAX} 个字符`);
  });

  it("接受边界值 3 与 20", () => {
    expect(validateUsername("abc")).toBeNull();
    expect(validateUsername("a".repeat(20))).toBeNull();
  });

  it("拒绝数字开头 / 下划线开头", () => {
    expect(validateUsername("1abc")).toBe("用户名必须以字母开头");
    expect(validateUsername("_abc")).toBe("用户名必须以字母开头");
  });

  it("拒绝含空格", () => {
    expect(validateUsername("ab cd")).toBe("用户名只能包含字母、数字和下划线");
  });

  it("拒绝 emoji / 中文 / 特殊符号", () => {
    expect(validateUsername("ab😊cd")).toBe("用户名只能包含字母、数字和下划线");
    expect(validateUsername("用户名")).toBe("用户名必须以字母开头");
    expect(validateUsername("ab@cd")).toBe("用户名只能包含字母、数字和下划线");
    expect(validateUsername("ab-cd")).toBe("用户名只能包含字母、数字和下划线");
  });

  it("接受字母/数字/下划线组合并 trim 首尾空格", () => {
    expect(validateUsername("  Alice_01  ")).toBeNull();
    expect(validateUsername("Bob2")).toBeNull();
  });
});

describe("validateEmail", () => {
  it("拒绝空与纯空格", () => {
    expect(validateEmail("")).toBe("邮箱不能为空");
    expect(validateEmail("   ")).toBe("邮箱不能为空");
  });

  it("拒绝缺 @ / 双 @ / 缺域名 / 缺 TLD", () => {
    expect(validateEmail("alice.example.com")).toBe("邮箱格式不正确");
    expect(validateEmail("alice@@example.com")).toBe("邮箱只能包含一个 @");
    expect(validateEmail("alice@")).toBe("邮箱格式不正确");
    expect(validateEmail("alice@example")).toBe("邮箱格式不正确");
  });

  it("拒绝 TLD 单字符", () => {
    expect(validateEmail("alice@example.c")).toBe("邮箱格式不正确");
  });

  it("拒绝含空格", () => {
    expect(validateEmail("alice @example.com")).toBe("邮箱不能包含空格");
    expect(validateEmail("ali ce@example.com")).toBe("邮箱不能包含空格");
  });

  it("大写归一化后接受", () => {
    expect(validateEmail("  Alice@Example.COM  ")).toBeNull();
  });

  it("接受本地点与 + 别名", () => {
    expect(validateEmail("alice.bob@example.com")).toBeNull();
    expect(validateEmail("alice+news@example.com")).toBeNull();
  });

  it("拒绝一次性邮箱域名（大小写不敏感）", () => {
    expect(validateEmail("a@mailinator.com")).toBe("请使用非一次性邮箱");
    expect(validateEmail("a@TempMail.COM")).toBe("请使用非一次性邮箱");
    expect(validateEmail("a@10minutemail.com")).toBe("请使用非一次性邮箱");
  });
});

describe("validatePassword", () => {
  it("拒绝空", () => {
    expect(validatePassword("")).toBe("密码不能为空");
  });

  it("拒绝过短 / 超长", () => {
    expect(validatePassword("Aa1!")).toBe(`密码至少 ${PASSWORD_MIN} 个字符`);
    expect(validatePassword("A".repeat(PASSWORD_MAX + 1))).toBe(`密码最多 ${PASSWORD_MAX} 个字符`);
  });

  it("拒绝含空格", () => {
    expect(validatePassword("Aa1! Aa1!")).toBe("密码不能包含空格");
  });

  it("分别拒绝缺大写 / 小写 / 数字 / 特殊", () => {
    expect(validatePassword("abcdef1!")).toBe("密码必须包含大写字母");
    expect(validatePassword("ABCDEF1!")).toBe("密码必须包含小写字母");
    expect(validatePassword("Abcdefg!")).toBe("密码必须包含数字");
    expect(validatePassword("Abcdefg1")).toBe("密码必须包含特殊符号");
  });

  it("下划线不计为特殊符号", () => {
    expect(validatePassword("Abcdefg1_")).toBe("密码必须包含特殊符号");
  });

  it("接受合规密码", () => {
    expect(validatePassword("Abcdefg1!")).toBeNull();
    expect(validatePassword("P@ssw0rd")).toBeNull();
  });
});

describe("validateConfirmPassword", () => {
  it("拒绝空", () => {
    expect(validateConfirmPassword("", "Abcdefg1!")).toBe("请再次输入密码");
  });

  it("拒绝不一致", () => {
    expect(validateConfirmPassword("Abcdefg1@", "Abcdefg1!")).toBe("两次输入的密码不一致");
  });

  it("接受一致", () => {
    expect(validateConfirmPassword("Abcdefg1!", "Abcdefg1!")).toBeNull();
  });
});

describe("passwordStrength", () => {
  it("空串为 weak", () => {
    expect(passwordStrength("")).toBe("weak");
  });

  it("短或单一字符种类为 weak/fair", () => {
    expect(passwordStrength("abc")).toBe("weak");
    expect(passwordStrength("abcdefgh")).toBe("weak"); // 仅长度 => 1
    expect(passwordStrength("Abcdefgh")).toBe("fair"); // 长度 + 大小写 => 2
  });

  it("合规密码为 strong", () => {
    expect(passwordStrength("Abcdefg1!")).toBe("strong");
    expect(passwordStrength("Abcdefghij12!@")).toBe("strong");
  });
});
