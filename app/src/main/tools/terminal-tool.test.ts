import { describe, expect, it } from "vitest";

import { evaluateReadonlyCommand } from "./terminal-tool.js";

describe("evaluateReadonlyCommand", () => {
  describe("allows read-only commands", () => {
    const allowed = [
      "ls -la",
      "cat README.md",
      "head -n 20 src/index.ts",
      "tail -n 50 src/index.ts",
      "rg 'function\\s+\\w+' src",
      "grep -rn TODO packages",
      "find . -name '*.ts' -not -path '*/node_modules/*'",
      "git status",
      "git log --oneline -5",
      "git diff HEAD~1",
      "git show abc1234",
      "git ls-files",
      "wc -l src/index.ts",
      "tree -L 2",
      "echo $HOME",
      "ls | head -5",
      "rg foo | grep bar | wc -l",
      "/bin/ls -la",
      "pwd",
      "stat package.json",
      "du -sh node_modules",
    ];

    for (const command of allowed) {
      it(`allows: ${command}`, () => {
        expect(evaluateReadonlyCommand(command)).toEqual({ allowed: true });
      });
    }
  });

  describe("rejects write/exec operations", () => {
    const cases: Array<[string, RegExp]> = [
      // Non-allowlisted commands.
      ["rm -rf /", /read-only allowlist/],
      ["npm install", /read-only allowlist/],
      ["node script.js", /read-only allowlist/],
      ["bash -c 'rm -rf x'", /read-only allowlist/],
      ["sh -c 'whoami'", /read-only allowlist/],
      ["python3 -m http.server", /read-only allowlist/],
      // Redirects (write to filesystem).
      ["echo hi > out.txt", /write-capable operator ">"/],
      ["echo hi >> out.txt", /write-capable operator ">"/],
      ["cat < in.txt", /write-capable operator "<"/],
      // Command chaining / background / substitution.
      ["ls && rm -rf x", /write-capable operator "&"/],
      ["ls ; rm -rf x", /write-capable operator ";"/],
      ["ls || rm -rf x", /write-capable operator "\|\|"/],
      ["ls & echo done", /write-capable operator "&"/],
      ["echo `rm -rf x`", /write-capable operator "backtick"/],
      ["echo $(rm -rf x)", /write-capable operator "\$\("/],
      // Newline as a command separator.
      ["ls\ncat secret", /single line/],
      ["ls\r\ncat secret", /single line/],
      // find exec/delete/write actions. The `\;` form is caught by the `;`
      // operator check first; the `+` form (no semicolon) reaches the find
      // guard. Both are rejected.
      ["find . -exec rm {} \\;", /write-capable operator ";"/],
      ["find . -exec rm {} +", /find exec\/delete\/write/],
      ["find . -delete", /find exec\/delete\/write/],
      ["find . -name x -execdir touch {} +", /find exec\/delete\/write/],
      ["find . -fls out.txt", /find exec\/delete\/write/],
      // git mutating subcommands.
      ["git push", /git subcommand "push"/],
      ["git reset --hard", /git subcommand "reset"/],
      ["git checkout main", /git subcommand "checkout"/],
      ["git commit -m x", /git subcommand "commit"/],
      ["git clean -fd", /git subcommand "clean"/],
      // Pipe into a non-allowlisted command.
      ["ls | xargs rm", /read-only allowlist/],
      ["ls | bash", /read-only allowlist/],
    ];

    for (const [command, reasonRe] of cases) {
      it(`rejects: ${command}`, () => {
        const result = evaluateReadonlyCommand(command);
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.reason).toMatch(reasonRe);
        }
      });
    }
  });
});
