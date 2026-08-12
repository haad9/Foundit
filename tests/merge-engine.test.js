const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeProposals, mergeProposals, BASE_CONFIG } = require("../merge-engine");

const demoProposals = [
  { name: "Maya", prompt: "Make checkout feel instant. Put everything on one clean page and add express pay." },
  { name: "Theo", prompt: "Add discount codes and verify the address before payment." },
];

test("extracts visible checkout behavior from both teammate ideas", () => {
  const analysis = analyzeProposals({ proposals: demoProposals });

  assert.equal(analysis.branches.length, 2);
  assert.deepEqual(analysis.branches[0].config, {
    ...BASE_CONFIG,
    layout: "single",
    expressPay: true,
  });
  assert.deepEqual(analysis.branches[1].config, {
    ...BASE_CONFIG,
    discountCodes: true,
    addressVerification: "step",
  });
  assert.equal(analysis.summary.totalChanges, 4);
});

test("finds the semantic conflict between one page and a separate verification step", () => {
  const analysis = analyzeProposals({ proposals: demoProposals });

  assert.equal(analysis.conflicts.length, 1);
  assert.equal(analysis.conflicts[0].id, "conflict-shipping-flow");
  assert.equal(analysis.conflicts[0].recommendedOptionId, "combined");
});

test("merges both demo ideas using the compatible inline resolution", () => {
  const result = mergeProposals({ proposals: demoProposals });

  assert.equal(result.passed, true);
  assert.deepEqual(result.config, {
    ...BASE_CONFIG,
    layout: "single",
    expressPay: true,
    discountCodes: true,
    addressVerification: "inline",
  });
  assert.equal(result.checks.length, 4);
  assert.ok(result.checks.every((check) => check.passed));
  assert.match(result.versionId, /^[a-f0-9]{10}$/);
});

test("honors an explicit teammate choice instead of the recommendation", () => {
  const result = mergeProposals({
    proposals: demoProposals,
    resolutions: { "conflict-shipping-flow": "theo" },
  });

  assert.equal(result.config.layout, "steps");
  assert.equal(result.config.addressVerification, "step");
});

test("detects direct opposite requests for the same behavior", () => {
  const analysis = analyzeProposals({
    proposals: [
      { name: "Maya", prompt: "Add discount codes for the summer campaign." },
      { name: "Theo", prompt: "No discount codes should appear in checkout." },
    ],
  });

  assert.equal(analysis.conflicts.length, 1);
  assert.equal(analysis.conflicts[0].key, "discountCodes");
});

test("merges compatible changes without inventing a conflict", () => {
  const result = mergeProposals({
    proposals: [
      { name: "Maya", prompt: "Add a gift message to each order." },
      { name: "Theo", prompt: "Let customers add delivery instructions as order notes." },
    ],
  });

  assert.equal(result.analysis.conflicts.length, 0);
  assert.equal(result.config.giftMessage, true);
  assert.equal(result.config.orderNotes, true);
  assert.equal(result.passed, true);
});

test("returns an actionable warning when an idea is outside the supported slice", () => {
  const analysis = analyzeProposals({
    proposals: [
      { name: "Maya", prompt: "Make it feel more delightful." },
      { name: "Theo", prompt: "Add express payment." },
    ],
  });

  assert.equal(analysis.branches[0].changes.length, 0);
  assert.match(analysis.branches[0].warnings[0], /No supported checkout behavior/);
});

test("rejects malformed and unmergeable requests", () => {
  assert.throws(() => analyzeProposals({ proposals: [] }), /Exactly two/);
  assert.throws(() => analyzeProposals({ proposals: [{ name: "Maya", prompt: "x" }, { name: "Theo", prompt: "valid" }] }), /too short/);
  assert.throws(() => mergeProposals({
    proposals: [
      { name: "Maya", prompt: "Make it prettier please." },
      { name: "Theo", prompt: "Use friendly writing everywhere." },
    ],
  }), /No supported changes/);
});
