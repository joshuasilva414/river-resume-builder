import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { appearanceBootstrap } from "../../apps/web/src/components/appearance-bootstrap.ts";

for (const saved of ["dark", "light", null]) {
  test(`initializes saved ${saved} appearance without the React runtime`, () => {
    const calls = [];
    runInNewContext(appearanceBootstrap, {
      document: { documentElement: { classList: { toggle: (...args) => calls.push(args) } } },
      localStorage: { getItem: () => saved },
    });
    assert.deepEqual(calls, [["dark", saved === "dark"]]);
  });
}

test("keeps the default appearance when browser storage is unavailable", () => {
  const calls = [];
  runInNewContext(appearanceBootstrap, {
    document: { documentElement: { classList: { toggle: (...args) => calls.push(args) } } },
    localStorage: {
      getItem() {
        throw new Error("Storage access denied");
      },
    },
  });
  assert.deepEqual(calls, []);
});
