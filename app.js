const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const DEFAULT_PROPOSALS = [
  { name: "Maya", prompt: "Make checkout feel instant. Put everything on one clean page and add express pay." },
  { name: "Theo", prompt: "Add discount codes and verify the address before payment." },
];

const EXAMPLES = {
  launch: DEFAULT_PROPOSALS,
  access: [
    { name: "Maya", prompt: "Keep guest checkout and add discount codes." },
    { name: "Theo", prompt: "Require every customer to sign in to an account before checkout." },
  ],
  compatible: [
    { name: "Maya", prompt: "Let customers add a personal gift message." },
    { name: "Theo", prompt: "Add order notes for delivery instructions." },
  ],
};

const state = {
  step: 1,
  branch: "maya",
  view: "preview",
  merging: false,
  merged: false,
  analysis: null,
  mergeResult: null,
  proposals: structuredClone(DEFAULT_PROPOSALS),
  resolutions: {},
  activeConflictIndex: 0,
  timers: [],
};

const stageLabel = $("#stageLabel");
const progressBar = $("#progressBar");
const statusText = $("#statusText");
const shopPage = $("#shopPage");
const changeView = $("#changeView");
const browserFrame = $("#browserFrame");
const inspectorInitial = $("#inspectorInitial");
const conflictCard = $("#conflictCard");
const mergeCard = $("#mergeCard");
const successCard = $("#successCard");
const ideasModal = $("#ideasModal");

function clearTimers() {
  state.timers.forEach(window.clearTimeout);
  state.timers = [];
}

function wait(delay) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, delay);
    state.timers.push(timer);
  });
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed with status ${response.status}`);
  return data;
}

function setStep(step, label, status) {
  state.step = step;
  stageLabel.textContent = `0${step} · ${label}`;
  progressBar.style.width = `${step * 33.333}%`;
  statusText.textContent = status;
  document.body.dataset.demoState = step === 1 ? "branches" : step === 2 ? "conflict" : state.merged ? "merged" : "merging";
}

function showInspector(panel) {
  [inspectorInitial, conflictCard, mergeCard, successCard].forEach((item) => item.classList.add("hidden"));
  panel.classList.remove("hidden");
}

function setView(view) {
  state.view = view;
  $$(".view-toggle button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const showingChanges = view === "changes";
  changeView.classList.toggle("visible", showingChanges);
  shopPage.style.display = showingChanges ? "none" : "block";
  $$(".cursor").forEach((cursor) => { cursor.style.opacity = showingChanges || state.merged ? "0" : "1"; });
}

function setPreviewConfig(config, mode = "branch") {
  shopPage.className = "shop-page";
  shopPage.classList.toggle("no-express", !config.expressPay);
  shopPage.classList.toggle("has-discount", config.discountCodes);
  shopPage.classList.toggle("verify-inline", config.addressVerification === "inline");
  shopPage.classList.toggle("verify-step", config.addressVerification === "step");
  shopPage.classList.toggle("layout-steps", config.layout === "steps");
  shopPage.classList.toggle("merged", mode === "merged");

  $("#layoutBadge").textContent = config.layout === "single" ? "Checkout · One page" : "Checkout · Guided flow";
  $("#checkoutTitle").innerHTML = config.layout === "single"
    ? "Everything you need,<br />all in one place."
    : "A calm checkout,<br />step by step.";

  const badge = $("#verifiedBadge");
  badge.textContent = config.addressVerification === "step" ? "Next: verify" : "✓ Verified";

  $("#accessLabel").innerHTML = config.checkoutAccess === "account"
    ? '<input type="checkbox" checked disabled /> Account required before payment'
    : '<input type="checkbox" checked /> Save my details for next time';

  $("#extrasPanel").classList.toggle("visible", config.orderNotes || config.giftMessage);
  $("#orderNotesField").style.display = config.orderNotes ? "block" : "none";
  $("#giftMessageField").style.display = config.giftMessage ? "block" : "none";
}

function selectBranch(name) {
  if (state.merging || state.merged || !state.analysis) return;
  const branch = state.analysis.branches.find((item) => item.id === name) || state.analysis.branches[name === "maya" ? 0 : 1];
  state.branch = branch.id;
  $$(".branch-card").forEach((card, index) => card.classList.toggle("selected", state.analysis.branches[index].id === branch.id));
  setPreviewConfig(branch.config);
  setView("preview");
}

function makeChangeElement(change, conflict = false, index = 0) {
  const article = document.createElement("article");
  article.className = `change-item ${conflict ? "conflict" : "keep"}`;

  const number = document.createElement("span");
  number.className = "change-index";
  number.textContent = String(index + 1).padStart(2, "0");

  const owner = document.createElement("div");
  owner.className = "change-owner";
  const swatch = document.createElement("i");
  swatch.className = `owner-swatch ${conflict ? "team" : change.sourceId || "team"}`;
  const source = document.createElement("small");
  source.textContent = conflict ? "Team decision" : change.sourceName;
  owner.append(swatch, source);

  const copy = document.createElement("div");
  copy.className = "change-copy";
  const title = document.createElement("strong");
  title.textContent = change.title;
  const description = document.createElement("p");
  description.textContent = change.description;
  copy.append(title, description);

  const action = document.createElement("span");
  action.className = "change-action";
  action.textContent = conflict ? "Needs decision" : "Included";
  article.append(number, owner, copy, action);
  return article;
}

function renderChanges() {
  const list = $("#changeList");
  list.innerHTML = "";
  let index = 0;
  for (const branch of state.analysis.branches) {
    for (const change of branch.changes) {
      list.append(makeChangeElement(change, false, index));
      index += 1;
    }
  }
  for (const conflict of state.analysis.conflicts) {
    list.append(makeChangeElement({
      sourceId: "team",
      sourceName: "Team",
      title: conflict.title,
      description: conflict.explanation,
    }, true, index));
    index += 1;
  }
}

function renderBranchCards() {
  state.analysis.branches.forEach((branch, index) => {
    const card = $$(".branch-card")[index];
    card.dataset.branch = branch.id;
    card.querySelector(".branch-top strong").textContent = `${branch.name}'s idea`;
    card.querySelector(".avatar").textContent = branch.name.charAt(0).toUpperCase();
    card.querySelector(".branch-prompt").textContent = `“${branch.prompt}”`;
    const chips = card.querySelector(".chips");
    chips.innerHTML = "";
    const items = branch.changes.length ? branch.changes : [{ label: "No supported change" }];
    items.forEach((change) => {
      const chip = document.createElement("span");
      chip.textContent = change.label;
      if (!branch.changes.length) chip.classList.add("warning-chip");
      chips.append(chip);
    });
  });
}

function renderAnalysis(analysis) {
  state.analysis = analysis;
  state.mergeResult = null;
  state.resolutions = {};
  state.activeConflictIndex = 0;
  state.merging = false;
  state.merged = false;
  renderBranchCards();
  renderChanges();
  $("#readyCopy").textContent = `Foundit found ${analysis.summary.totalChanges} change${analysis.summary.totalChanges === 1 ? "" : "s"} across two versions.`;
  $(".view-toggle .count").textContent = analysis.summary.totalChanges;
  $("#compareBtn").disabled = !analysis.summary.canMerge;
  $("#compareBtn").innerHTML = analysis.summary.canMerge ? 'Compare changes <span>→</span>' : "Try supported ideas";
  showInspector(inspectorInitial);
  setStep(1, "Parallel changes", analysis.summary.canMerge ? "Two real versions are ready to compare" : "Edit the ideas to create a supported checkout change");
  setView("preview");
  selectBranch(state.analysis.branches[0].id);
}

function renderActiveConflict() {
  const conflicts = state.analysis.conflicts;
  conflictCard.classList.toggle("no-conflict", conflicts.length === 0);
  const titleIcon = conflictCard.querySelector(".conflict-title > span");

  if (!conflicts.length) {
    titleIcon.textContent = "✓";
    $("#conflictCount").textContent = "0 overlaps found";
    $("#conflictHeading").textContent = "These ideas work together";
    $("#conflictExplanation").textContent = "Foundit can combine both versions without asking the team to choose between them.";
    $(".decision-box").classList.add("hidden");
    $("#resolveBtn").innerHTML = 'Merge compatible ideas <span>✦</span>';
    return;
  }

  const conflict = conflicts[state.activeConflictIndex];
  titleIcon.textContent = "!";
  $("#conflictCount").textContent = `${conflicts.length} overlap${conflicts.length === 1 ? "" : "s"} found · ${state.activeConflictIndex + 1} of ${conflicts.length}`;
  $("#conflictHeading").textContent = conflict.title;
  $("#conflictExplanation").textContent = conflict.explanation;
  $("#conflictArea").textContent = conflict.title;
  $(".decision-box").classList.remove("hidden");

  const options = $("#decisionOptions");
  options.innerHTML = "";
  conflict.options.forEach((option) => {
    const label = document.createElement("label");
    const selectedId = state.resolutions[conflict.id] || conflict.recommendedOptionId;
    const isRecommended = option.id === conflict.recommendedOptionId;
    label.classList.toggle("recommended", isRecommended);
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `choice-${conflict.id}`;
    radio.value = option.id;
    radio.checked = option.id === selectedId;
    radio.addEventListener("change", () => {
      state.resolutions[conflict.id] = option.id;
      updateResolveLabel(option.label);
    });
    label.append(radio, document.createTextNode(` ${option.label}`));
    if (isRecommended) {
      const tag = document.createElement("em");
      tag.textContent = "Best fit";
      label.append(tag);
    }
    options.append(label);
  });

  const selectedOption = conflict.options.find((option) => option.id === (state.resolutions[conflict.id] || conflict.recommendedOptionId));
  updateResolveLabel(selectedOption.label);
}

function updateResolveLabel(optionLabel) {
  const hasNext = state.activeConflictIndex < state.analysis.conflicts.length - 1;
  $("#resolveBtn").innerHTML = hasNext ? `Save “${optionLabel}” <span>→</span>` : `${optionLabel} <span>✦</span>`;
}

function compareChanges() {
  if (state.merging || state.merged || !state.analysis?.summary.canMerge) return;
  state.activeConflictIndex = 0;
  setView("changes");
  showInspector(conflictCard);
  renderActiveConflict();
  const count = state.analysis.conflicts.length;
  setStep(2, count ? "Resolve overlap" : "Review changes", count ? `Foundit found ${count} decision${count === 1 ? "" : "s"}—not a wall of code` : "No conflicts found · Both ideas can be safely combined");
}

function acceptConflictOrMerge() {
  const conflicts = state.analysis.conflicts;
  if (conflicts.length) {
    const conflict = conflicts[state.activeConflictIndex];
    if (!state.resolutions[conflict.id]) state.resolutions[conflict.id] = conflict.recommendedOptionId;
    if (state.activeConflictIndex < conflicts.length - 1) {
      state.activeConflictIndex += 1;
      renderActiveConflict();
      return;
    }
  }
  runMerge();
}

async function runMerge() {
  if (state.merging || state.merged || !state.analysis?.summary.canMerge) return;
  state.merging = true;
  setView("preview");
  showInspector(mergeCard);
  setStep(3, "Safe merge", "Combining both ideas and running real checks");
  $("#mergeChecks").innerHTML = '<li><span></span>Analyzing the merged checkout…</li>';

  try {
    const result = await api("/api/merge", { proposals: state.proposals, resolutions: state.resolutions });
    state.mergeResult = result;
    const list = $("#mergeChecks");
    list.innerHTML = "";
    result.checks.forEach((check) => {
      const item = document.createElement("li");
      item.innerHTML = `<span></span>${check.label}`;
      list.append(item);
    });
    for (const item of [...list.children]) {
      await wait(260);
      item.classList.add("done");
    }
    await wait(240);
    finishMerge(result);
  } catch (error) {
    state.merging = false;
    showInspector(conflictCard);
    showErrorToast("Merge stopped", error.message);
  }
}

function describeConfig(config) {
  const features = [];
  features.push(config.layout === "single" ? "one-page checkout" : "guided checkout");
  if (config.expressPay) features.push("express payment");
  if (config.discountCodes) features.push("discount codes");
  if (config.addressVerification === "inline") features.push("inline address verification");
  if (config.addressVerification === "step") features.push("an address verification step");
  if (config.checkoutAccess === "account") features.push("account-only access");
  if (config.orderNotes) features.push("order notes");
  if (config.giftMessage) features.push("gift messages");
  return `${features.join(", ")}—all working together.`;
}

function finishMerge(result) {
  state.merging = false;
  state.merged = true;
  setPreviewConfig(result.config, "merged");
  $$(".branch-card").forEach((card) => card.classList.add("selected"));
  $("#successCopy").textContent = describeConfig(result.config);
  $("#passedCount").textContent = result.checks.filter((check) => check.passed).length;
  showInspector(successCard);
  statusText.textContent = `Merge complete · Version ${result.versionId} is ready`;
  document.body.dataset.demoState = "merged";
  showToast("Safe rollback created", `Version ${result.versionId} can be restored.`);
}

function openMergedApp() {
  if (!state.merged) return;
  setView("preview");
  setPreviewConfig(state.mergeResult.config, "merged");
  browserFrame.animate(
    [{ transform: "scale(1)" }, { transform: "scale(.985)" }, { transform: "scale(1)" }],
    { duration: 480, easing: "cubic-bezier(.22,.88,.23,1)" }
  );
}

function showToast(title = "Safe rollback created", copy = "You can return to either original version.") {
  const toast = $("#toast");
  toast.querySelector("span").textContent = "✓";
  toast.querySelector("strong").textContent = title;
  toast.querySelector("small").textContent = copy;
  toast.classList.add("visible");
  wait(2200).then(() => toast.classList.remove("visible"));
}

function showErrorToast(title, copy) {
  const toast = $("#toast");
  toast.querySelector("span").textContent = "!";
  toast.querySelector("strong").textContent = title;
  toast.querySelector("small").textContent = copy;
  toast.classList.add("visible", "error");
  wait(2800).then(() => toast.classList.remove("visible", "error"));
}

async function shareDemo() {
  const url = `${window.location.origin}${window.location.pathname}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Foundit Merge", text: "Try multiplayer vibe coding", url });
      return;
    }
    await navigator.clipboard.writeText(url);
    showToast("Demo link copied", url);
  } catch (error) {
    if (error.name !== "AbortError") showErrorToast("Could not copy the link", "Copy the address from the browser bar instead.");
  }
}

function openIdeas() {
  $("#mayaPrompt").value = state.proposals[0].prompt;
  $("#theoPrompt").value = state.proposals[1].prompt;
  updateCounts();
  $("#ideasError").classList.add("hidden");
  ideasModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => $("#mayaPrompt").focus(), 50);
}

function closeIdeas() {
  ideasModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function updateCounts() {
  $("#mayaCount").textContent = `${$("#mayaPrompt").value.length} / 500`;
  $("#theoCount").textContent = `${$("#theoPrompt").value.length} / 500`;
}

async function submitIdeas(event) {
  event.preventDefault();
  const button = $("#analyzeBtn");
  const proposals = [
    { name: "Maya", prompt: $("#mayaPrompt").value.trim() },
    { name: "Theo", prompt: $("#theoPrompt").value.trim() },
  ];
  button.disabled = true;
  button.innerHTML = 'Building versions <span class="button-spinner">✦</span>';
  $("#ideasError").classList.add("hidden");
  try {
    const analysis = await api("/api/analyze", { proposals });
    state.proposals = proposals;
    renderAnalysis(analysis);
    closeIdeas();
    showToast("Two versions are ready", `${analysis.summary.totalChanges} plain-English changes found.`);
  } catch (error) {
    $("#ideasError").textContent = error.message;
    $("#ideasError").classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Build both versions <span>→</span>';
  }
}

async function resetDemo(showMessage = false) {
  clearTimers();
  state.proposals = structuredClone(DEFAULT_PROPOSALS);
  state.resolutions = {};
  state.merging = false;
  state.merged = false;
  browserFrame.classList.remove("mobile");
  $$(".device-toggle button").forEach((button) => button.classList.toggle("active", button.dataset.device === "desktop"));
  try {
    renderAnalysis(await api("/api/analyze", { proposals: state.proposals }));
    if (showMessage) showToast("Demo reset", "Back to Maya and Theo's original ideas.");
  } catch (error) {
    showErrorToast("Foundit API is offline", "Start the demo with node server.js instead of opening the HTML file directly.");
    throw error;
  }
}

function bindEvents() {
  $$(".branch-card").forEach((card) => card.addEventListener("click", () => selectBranch(card.dataset.branch)));
  $$(".preview-link").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    selectBranch(button.closest(".branch-card").dataset.branch);
  }));

  $$(".view-toggle button").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.view === "changes" && state.step === 1) compareChanges();
    else setView(button.dataset.view);
  }));

  $$(".device-toggle button").forEach((button) => button.addEventListener("click", () => {
    $$(".device-toggle button").forEach((item) => item.classList.toggle("active", item === button));
    browserFrame.classList.toggle("mobile", button.dataset.device === "mobile");
  }));

  $("#compareBtn").addEventListener("click", compareChanges);
  $("#resolveBtn").addEventListener("click", acceptConflictOrMerge);
  $("#openBtn").addEventListener("click", openMergedApp);
  $("#rollbackBtn").addEventListener("click", () => resetDemo(true));
  $("#resetBtn").addEventListener("click", () => resetDemo(true));
  $("#editIdeasBtn").addEventListener("click", openIdeas);
  $("#editIdeasSmall").addEventListener("click", openIdeas);
  $("#shareBtn").addEventListener("click", shareDemo);
  $("#closeIdeasBtn").addEventListener("click", closeIdeas);
  $("#ideasForm").addEventListener("submit", submitIdeas);
  ideasModal.addEventListener("click", (event) => { if (event.target === ideasModal) closeIdeas(); });
  [$("#mayaPrompt"), $("#theoPrompt")].forEach((input) => input.addEventListener("input", updateCounts));

  $$("[data-example]").forEach((button) => button.addEventListener("click", () => {
    const proposals = EXAMPLES[button.dataset.example];
    $("#mayaPrompt").value = proposals[0].prompt;
    $("#theoPrompt").value = proposals[1].prompt;
    updateCounts();
  }));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ideasModal.classList.contains("hidden")) closeIdeas();
    if (event.target.matches("textarea, input")) return;
    if (event.key.toLowerCase() === "r") resetDemo();
    if (event.key === "1") compareChanges();
    if (event.key === "2") acceptConflictOrMerge();
    if (event.key === "3") openMergedApp();
    if (event.key.toLowerCase() === "e") openIdeas();
  });
}

async function initialize() {
  bindEvents();
  await resetDemo();
  const preset = new URLSearchParams(window.location.search).get("state");
  if (preset === "ideas") openIdeas();
  if (preset === "conflict") compareChanges();
  if (preset === "merged") {
    const result = await api("/api/merge", { proposals: state.proposals });
    state.mergeResult = result;
    setStep(3, "Safe merge", "Opening the tested merged version");
    finishMerge(result);
  }
  document.body.dataset.ready = "true";
}

initialize().catch(() => {
  document.body.dataset.ready = "error";
});
