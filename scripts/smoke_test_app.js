#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class ClassList {
  constructor() {
    this.values = new Set();
  }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  toggle(name, force) {
    if (force === undefined) force = !this.values.has(name);
    if (force) this.values.add(name);
    else this.values.delete(name);
    return force;
  }
}

class ElementStub {
  constructor() {
    this.textContent = "";
    this.innerHTML = "";
    this.dataset = {};
    this.classList = new ClassList();
    this.attributes = new Map();
  }
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() {}
}

const elements = new Map();
for (const selector of [
  "#view-root",
  "#page-title",
  "#toast",
  "#progress-step",
  "#progress-current",
  "#document-drawer",
  "#document-backdrop",
  "#document-drawer-content",
  "#preflight-count",
  "#findings-count",
  ".app-shell",
]) elements.set(selector, new ElementStub());

const body = new ElementStub();
const documentStub = {
  body,
  activeElement: body,
  querySelector(selector) { return elements.get(selector) || null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  contains() { return true; },
};

const context = {
  console,
  document: documentStub,
  HTMLElement: ElementStub,
  window: {
    clearTimeout() {},
    setTimeout(callback) { callback(); return 1; },
    scrollTo() {},
    print() {},
  },
};
context.globalThis = context;
vm.createContext(context);

const appPath = path.resolve(__dirname, "..", "app.js");
const source = fs.readFileSync(appPath, "utf8") + `
globalThis.__appTest = {
  setView,
  renderCases,
  renderFormula,
  renderPreflight,
  renderFindings,
  renderSummary,
  renderOfficialSource,
  updateCounts,
  openDocument,
  closeDocument,
  getDrawerFinding,
  demoCase,
  sourceDocuments,
  state,
};`;

vm.runInContext(source, context, { filename: appPath });
const app = context.__appTest;

const assertions = [
  [app.renderCases().includes("first pilot is consultancy-led"), "consultancy-first target copy"],
  [app.renderFormula().includes("View source"), "formula source entry"],
  [app.renderFormula().includes('data-document-finding="F-03"'), "phenoxyethanol row links to its finding"],
  [app.renderPreflight().includes("View source"), "preflight source entry"],
  [app.renderFindings().includes("Customer document"), "findings customer-document entry"],
  [app.renderFindings().includes("Official rule"), "findings official-rule entry"],
  [Object.keys(app.sourceDocuments).length === 3, "three synthetic source views"],
  [app.demoCase.formula.every((row) => app.sourceDocuments[row.documentId]), "formula source ids resolve"],
  [app.state.issues.every((issue) => app.sourceDocuments[issue.documentId]), "preflight source ids resolve"],
  [app.state.findings.every((finding) => app.sourceDocuments[finding.documentId]), "finding source ids resolve"],
  [app.renderOfficialSource(app.state.findings[0]).includes("Official rule evaluation deferred"), "missing evidence defers rule evaluation"],
];

for (const [passed, label] of assertions) {
  if (!passed) throw new Error(`Smoke test failed: ${label}`);
}

for (const view of ["cases", "context", "formula", "preflight", "findings", "summary"]) {
  app.setView(view);
}
if (app.state.completedViews.size !== 0) throw new Error("Navigation alone marked workflow steps complete");

app.state.issues[0].status = "Reviewer";
app.updateCounts();
if (elements.get("#preflight-count").textContent !== 3) throw new Error("Reviewer issue disappeared from unresolved count");
if (!app.renderPreflight().includes("Reviewer flagged")) throw new Error("Reviewer issue did not display its current status");
app.state.issues[0].status = "Resolved";
if (!app.renderPreflight().includes('issue-card resolved')) throw new Error("Resolved issue did not render a resolved state");
app.state.issues[0].status = "Open";

app.openDocument("fragrance", "customer", "F-01");
if (!body.classList.values.has("drawer-open")) throw new Error("Drawer did not open");
app.closeDocument();
if (body.classList.values.has("drawer-open")) throw new Error("Drawer did not close");

app.state.activeDocumentId = "fragrance";
app.state.drawerFindingId = null;
if (app.getDrawerFinding().id !== "SOURCE-ONLY") throw new Error("Generic source view inferred an unrelated finding");
app.state.drawerFindingId = "F-01";
if (app.getDrawerFinding().id !== "F-01") throw new Error("Explicit fragrance finding did not resolve");
app.state.activeDocumentId = "capb";
app.state.drawerFindingId = "F-02";
if (app.getDrawerFinding().id !== "F-02") throw new Error("CAPB document mapped to the wrong finding");

console.log("UI smoke test passed: six views, progress updates, and document drawer rendering.");
