import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { describeDbError } from "@/server/deploy/auto-setup";

describe("auto-setup error classification (describeDbError)", () => {
  test("classifies missing Prisma query_compiler_bg.wasm ENOENT as a runtime file error, not a DB connection failure", () => {
    const prismaWrapped = Object.assign(
      new Error("Invalid `prisma.activityLog.count()` invocation:\nENOENT: no such file or directory, open '.../node_modules/.prisma/client/query_compiler_bg.wasm'"),
      { code: "ENOENT" },
    );
    const out1 = describeDbError(prismaWrapped);
    assert.match(out1, /query_compiler_bg\.wasm/);
    assert.doesNotMatch(out1, /server database tidak bisa dihubungi/i);

    const directFs = Object.assign(
      new Error("ENOENT: no such file or directory, open '/app/node_modules/.prisma/client/query_compiler_bg.wasm'"),
      { code: "ENOENT", errno: -2, syscall: "open" },
    );
    const out2 = describeDbError(directFs);
    assert.match(out2, /query_compiler_bg\.wasm/);
    assert.doesNotMatch(out2, /server database tidak bisa dihubungi/i);
  });

  test("classifies generic filesystem ENOENT/EACCES separately from database connectivity", () => {
    const err = Object.assign(new Error("ENOENT: no such file or directory, open '/app/something.json'"), {
      code: "ENOENT",
      errno: -2,
      syscall: "open",
    });
    const out = describeDbError(err);
    assert.match(out, /berkas runtime/i);
    assert.doesNotMatch(out, /server database tidak bisa dihubungi/i);
  });

  test("still classifies Unix socket ENOENT (syscall connect) as database connectivity error", () => {
    const err = Object.assign(new Error("connect ENOENT /var/lib/mysql/mysql.sock"), {
      code: "ENOENT",
      errno: -2,
      syscall: "connect",
    });
    assert.equal(describeDbError(err), "server database tidak bisa dihubungi (ENOENT)");
  });

  test("preserves MariaDB error classification", () => {
    assert.match(describeDbError({ errno: 1045 }), /login database ditolak/i);
    assert.match(describeDbError({ errno: 1049 }), /nama database tidak ada/i);
    assert.equal(describeDbError({ code: "ECONNREFUSED" }), "server database tidak bisa dihubungi (ECONNREFUSED)");
  });
});
