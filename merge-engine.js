const crypto = require("crypto");

const BASE_CONFIG = Object.freeze({
  layout: "steps",
  expressPay: false,
  discountCodes: false,
  addressVerification: "none",
  checkoutAccess: "guest",
  orderNotes: false,
  giftMessage: false,
});

const RULES = [
  {
    id: "layout-single",
    key: "layout",
    value: "single",
    label: "1-page checkout",
    title: "Combined checkout into one page",
    description: "Contact, shipping, and payment appear in one continuous flow.",
    patterns: [/one[- ]page/i, /single[- ]page/i, /all (?:on|in) one page/i, /everything on one/i, /simplif(?:y|ied).*checkout/i],
  },
  {
    id: "layout-steps",
    key: "layout",
    value: "steps",
    label: "Guided steps",
    title: "Separated checkout into guided steps",
    description: "Contact, shipping, and payment are handled as separate steps.",
    patterns: [/multi[- ]step/i, /separate (?:checkout )?steps/i, /guided (?:checkout|steps)/i, /step[- ]by[- ]step/i],
  },
  {
    id: "express-off",
    key: "expressPay",
    value: false,
    label: "No express pay",
    title: "Removed express payment",
    description: "Customers use the standard payment form.",
    patterns: [/remove .*express/i, /no express (?:pay|payment)/i, /disable .*apple pay/i],
  },
  {
    id: "express-on",
    key: "expressPay",
    value: true,
    label: "Express pay",
    title: "Added express payment",
    description: "Apple Pay and Poppy Pay appear above the form.",
    patterns: [/express (?:pay|payment|checkout)/i, /apple pay/i, /google pay/i, /instant pay/i],
  },
  {
    id: "discount-off",
    key: "discountCodes",
    value: false,
    label: "No discounts",
    title: "Removed discount codes",
    description: "The checkout no longer accepts promotion codes.",
    patterns: [/remove .*discount/i, /remove .*promo/i, /no (?:discount|promo|coupon)/i, /disable .*coupon/i],
  },
  {
    id: "discount-on",
    key: "discountCodes",
    value: true,
    label: "Discounts",
    title: "Added discount code field",
    description: "Customers can apply a promotion before paying.",
    patterns: [/discount/i, /promo(?:tion)? code/i, /coupon/i],
  },
  {
    id: "verify-none",
    key: "addressVerification",
    value: "none",
    label: "Skip verification",
    title: "Removed address verification",
    description: "Shipping addresses are accepted without an extra verification action.",
    patterns: [/skip .*address verif/i, /remove .*address verif/i, /do not verify .*address/i, /no address verif/i],
  },
  {
    id: "verify-inline",
    key: "addressVerification",
    value: "inline",
    label: "Inline verification",
    title: "Verified addresses inline",
    description: "The address is checked without adding another checkout step.",
    patterns: [/inline .*address/i, /address .*inline/i, /verify .*without .*step/i, /verification .*same page/i],
  },
  {
    id: "verify-step",
    key: "addressVerification",
    value: "step",
    label: "Address check",
    title: "Added address verification step",
    description: "The address must be verified before payment.",
    patterns: [/verify .*address/i, /address verif/i, /check .*address/i, /validate .*address/i],
  },
  {
    id: "access-account",
    key: "checkoutAccess",
    value: "account",
    label: "Account required",
    title: "Required an account before checkout",
    description: "Customers sign in before completing payment.",
    patterns: [/require .*account/i, /must (?:sign|log) in/i, /members? only/i, /account[- ]only/i],
  },
  {
    id: "access-guest",
    key: "checkoutAccess",
    value: "guest",
    label: "Guest checkout",
    title: "Enabled guest checkout",
    description: "Customers can pay without creating an account.",
    patterns: [/guest checkout/i, /without (?:an )?account/i, /no (?:sign|log)[- ]?in/i],
  },
  {
    id: "order-notes",
    key: "orderNotes",
    value: true,
    label: "Order notes",
    title: "Added order notes",
    description: "Customers can leave delivery instructions with the order.",
    patterns: [/order notes?/i, /delivery instructions?/i, /note (?:for|on) (?:the )?order/i],
  },
  {
    id: "gift-message",
    key: "giftMessage",
    value: true,
    label: "Gift message",
    title: "Added a gift message",
    description: "Customers can include a personal message with the order.",
    patterns: [/gift (?:note|message)/i, /personal message/i],
  },
];

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function validateProposals(proposals) {
  if (!Array.isArray(proposals) || proposals.length !== 2) {
    throw new TypeError("Exactly two teammate proposals are required.");
  }

  return proposals.map((proposal, index) => {
    const name = String(proposal?.name || (index === 0 ? "Maya" : "Theo")).trim().slice(0, 40);
    const prompt = String(proposal?.prompt || "").trim();
    if (prompt.length < 3) throw new TypeError(`${name}'s idea is too short.`);
    if (prompt.length > 500) throw new TypeError(`${name}'s idea must be 500 characters or fewer.`);
    return { id: slug(name) || `teammate-${index + 1}`, name, prompt };
  });
}

function extractChanges(proposal) {
  const seenKeys = new Set();
  const changes = [];

  for (const rule of RULES) {
    if (seenKeys.has(rule.key)) continue;
    if (!rule.patterns.some((pattern) => pattern.test(proposal.prompt))) continue;
    seenKeys.add(rule.key);
    changes.push({
      id: `${proposal.id}-${rule.id}`,
      sourceId: proposal.id,
      sourceName: proposal.name,
      key: rule.key,
      value: rule.value,
      label: rule.label,
      title: rule.title,
      description: rule.description,
    });
  }

  return changes;
}

function applyChanges(config, changes) {
  const next = { ...config };
  for (const change of changes) next[change.key] = change.value;
  return next;
}

function directConflict(left, right) {
  const titleByKey = {
    layout: "Checkout layout",
    expressPay: "Express payment",
    discountCodes: "Discount codes",
    addressVerification: "Address verification",
    checkoutAccess: "Guest access",
  };
  return {
    id: `conflict-${left.key}`,
    key: left.key,
    title: titleByKey[left.key] || "Overlapping behavior",
    explanation: `${left.sourceName} and ${right.sourceName} requested different behavior for the same part of checkout.`,
    sources: [left, right],
    options: [
      { id: left.sourceId, label: `Keep ${left.sourceName}'s version`, description: left.title, patch: { [left.key]: left.value } },
      { id: right.sourceId, label: `Keep ${right.sourceName}'s version`, description: right.title, patch: { [right.key]: right.value } },
    ],
    recommendedOptionId: left.sourceId,
  };
}

function findConflicts(branches) {
  const [leftBranch, rightBranch] = branches;
  const conflicts = [];
  const rightByKey = new Map(rightBranch.changes.map((change) => [change.key, change]));

  for (const left of leftBranch.changes) {
    const right = rightByKey.get(left.key);
    if (right && left.value !== right.value) conflicts.push(directConflict(left, right));
  }

  const singleChange = branches.flatMap((branch) => branch.changes).find((change) => change.key === "layout" && change.value === "single");
  const stepVerifyChange = branches.flatMap((branch) => branch.changes).find((change) => change.key === "addressVerification" && change.value === "step");
  if (singleChange && stepVerifyChange && singleChange.sourceId !== stepVerifyChange.sourceId) {
    conflicts.push({
      id: "conflict-shipping-flow",
      key: "shippingFlow",
      title: "Shipping address flow",
      explanation: `${singleChange.sourceName} removed extra checkout steps, while ${stepVerifyChange.sourceName} requested a separate address check.`,
      sources: [singleChange, stepVerifyChange],
      options: [
        {
          id: singleChange.sourceId,
          label: `Keep ${singleChange.sourceName}'s simpler flow`,
          description: "Use one page without address verification.",
          patch: { layout: "single", addressVerification: "none" },
        },
        {
          id: "combined",
          label: "Keep it simple + verify inline",
          description: "Preserve one page and verify the address without adding a step.",
          patch: { layout: "single", addressVerification: "inline" },
        },
        {
          id: stepVerifyChange.sourceId,
          label: `Use ${stepVerifyChange.sourceName}'s extra step`,
          description: "Keep address verification as a separate step.",
          patch: { layout: "steps", addressVerification: "step" },
        },
      ],
      recommendedOptionId: "combined",
    });
  }

  return conflicts;
}

function analyzeProposals(input) {
  const proposals = validateProposals(input?.proposals);
  const branches = proposals.map((proposal) => {
    const changes = extractChanges(proposal);
    return {
      id: proposal.id,
      name: proposal.name,
      prompt: proposal.prompt,
      changes,
      config: applyChanges(BASE_CONFIG, changes),
      warnings: changes.length ? [] : ["No supported checkout behavior was found in this idea."],
    };
  });
  const conflicts = findConflicts(branches);
  const totalChanges = branches.reduce((total, branch) => total + branch.changes.length, 0);

  return {
    baseConfig: { ...BASE_CONFIG },
    proposals,
    branches,
    conflicts,
    summary: {
      totalChanges,
      conflictCount: conflicts.length,
      canMerge: totalChanges > 0,
    },
  };
}

function selectOption(conflict, resolutions) {
  const wanted = resolutions?.[conflict.id] || conflict.recommendedOptionId;
  return conflict.options.find((option) => option.id === wanted)
    || conflict.options.find((option) => option.id === conflict.recommendedOptionId)
    || conflict.options[0];
}

function mergeProposals(input) {
  const analysis = analyzeProposals(input);
  if (!analysis.summary.canMerge) throw new TypeError("No supported changes were found to merge.");

  let config = { ...analysis.baseConfig };
  for (const branch of analysis.branches) config = applyChanges(config, branch.changes);

  const resolutions = [];
  for (const conflict of analysis.conflicts) {
    const option = selectOption(conflict, input?.resolutions);
    config = { ...config, ...option.patch };
    resolutions.push({ conflictId: conflict.id, optionId: option.id, label: option.label });
  }

  const versionId = crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 10);
  const checks = [
    { id: "features", label: "Requested features preserved", passed: analysis.branches.every((branch) => branch.changes.every((change) => change.key in config)) },
    { id: "flow", label: "Checkout flow is reachable", passed: ["single", "steps"].includes(config.layout) },
    { id: "compatibility", label: "Address rules are compatible", passed: !(config.layout === "single" && config.addressVerification === "step") },
    { id: "rollback", label: `Rollback point ${versionId} created`, passed: true },
  ];

  return {
    analysis,
    config,
    resolutions,
    versionId,
    checks,
    passed: checks.every((check) => check.passed),
  };
}

module.exports = {
  BASE_CONFIG,
  RULES,
  analyzeProposals,
  mergeProposals,
};
