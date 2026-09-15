const sourceUrl = "https://www.hsa.gov.sg/cosmetic-products/asean-cosmetic-directive/";

const demoCase = {
  id: "SG-FC-001",
  name: "Daily Gentle Cleanser",
  clientAlias: "Pilot Brand A",
  engagement: "Singapore formula evidence review",
  updated: "14 Sep 2026, 23:42",
  reviewer: "Demo Reviewer",
  context: {
    jurisdiction: "Singapore",
    category: "Facial cleanser",
    format: "Rinse-off",
    intendedUser: "Adults",
    applicationArea: "Face, excluding eye area",
    frequency: "Daily",
    claims: "Gentle daily cleansing",
    internalCode: "FC-DEMO-01",
  },
  formula: [
    { name: "Aqua", supplier: "—", use: "70.0%", inci: "Aqua", cas: "7732-18-5", composition: "Single substance", docs: "Formula sheet", documentId: "formula", findingId: null },
    { name: "Cocamidopropyl Betaine solution", supplier: "Supplier B", use: "20.0%", inci: "Declared; mapping to confirm", cas: "61789-40-0", composition: "Multi-component raw material", docs: "Specification v2.1", documentId: "capb", findingId: "F-02" },
    { name: "Glycerin", supplier: "Supplier C", use: "5.0%", inci: "Glycerin", cas: "56-81-5", composition: "Single substance", docs: "Formula sheet", documentId: "formula", findingId: null },
    { name: "Sodium Chloride", supplier: "Supplier D", use: "3.5%", inci: "Sodium Chloride", cas: "7647-14-5", composition: "Single substance", docs: "Formula sheet", documentId: "formula", findingId: null },
    { name: "Phenoxyethanol", supplier: "Supplier E", use: "0.8%", inci: "Phenoxyethanol", cas: "122-99-6", composition: "Single substance", docs: "Formula sheet", documentId: "formula", findingId: "F-03" },
    { name: "Xanthan Gum", supplier: "Supplier F", use: "0.5%", inci: "Xanthan Gum", cas: "11138-66-2", composition: "Single substance", docs: "Formula sheet", documentId: "formula", findingId: null },
    { name: "Fragrance F-17", supplier: "Supplier G", use: "0.2%", inci: "Fragrance", cas: "—", composition: "Not disclosed", docs: "SDS only", documentId: "fragrance", findingId: "F-01" },
  ],
};

const sourceDocuments = {
  formula: {
    title: "Client Formula Sheet",
    fileName: "Clarity_Review_Synthetic_Client_Source_Pack.pdf",
    documentType: "Formula sheet",
    version: "Formula sheet v3",
    page: "1 of 3",
    image: "./assets/source-pages/formula-sheet.png",
    alt: "Synthetic client formula sheet showing the seven raw materials and their use levels",
    extracted: [
      ["Case", "SG-FC-001"],
      ["Formula total", "100.0%"],
      ["Rows detected", "7 raw materials"],
      ["Open gap", "Fragrance supported by SDS only"],
    ],
    limitation: "The arithmetic total is complete, but the source pack does not contain component-level fragrance composition.",
  },
  fragrance: {
    title: "Fragrance F-17 Safety Data Sheet",
    fileName: "Clarity_Review_Synthetic_Client_Source_Pack.pdf",
    documentType: "Supplier SDS",
    version: "SDS 2.0 - 08 Sep 2026",
    page: "2 of 3",
    image: "./assets/source-pages/fragrance-sds.png",
    alt: "Synthetic fragrance safety data sheet with the undisclosed component row highlighted",
    extracted: [
      ["Raw material", "Fragrance F-17"],
      ["Use level", "0.2% from formula sheet"],
      ["Component identities", "Not disclosed"],
      ["Review state", "Information request required"],
    ],
    limitation: "This SDS identifies a proprietary mixture but does not disclose the component identities needed for component-level screening.",
  },
  capb: {
    title: "CAPB Supplier Specification",
    fileName: "Clarity_Review_Synthetic_Client_Source_Pack.pdf",
    documentType: "Product specification",
    version: "Specification v2.1 - 10 Sep 2026",
    page: "3 of 3",
    image: "./assets/source-pages/capb-specification.png",
    alt: "Synthetic Cocamidopropyl Betaine supplier specification with missing composition fields highlighted",
    extracted: [
      ["Raw material", "CAPB Solution B-30"],
      ["Use level", "20.0% from formula sheet"],
      ["Active matter", "29.0% - 31.0%"],
      ["Open gap", "Full component breakdown not supplied"],
    ],
    limitation: "The raw-material use level must not be treated as the concentration of one finished-product component.",
  },
};

const state = {
  activeView: "cases",
  selectedFindingId: "F-03",
  activeDocumentId: null,
  activeDocumentTab: "customer",
  drawerFindingId: null,
  lastSourceTrigger: null,
  completedViews: new Set(),
  issues: [
    {
      id: "P-01",
      kind: "missing",
      label: "Missing information",
      title: "Fragrance F-17 composition is not available",
      why: "The pilot cannot map the raw material to component-level identities or complete its scoped checks.",
      request: "Request complete composition or an authorised supplier statement.",
      status: "Open",
      documentId: "fragrance",
      findingId: "F-01",
    },
    {
      id: "P-02",
      kind: "identity",
      label: "Identity confirmation",
      title: "Cocamidopropyl Betaine solution is a multi-component raw material",
      why: "The trade name, declared INCI and supplier composition must be reconciled before a finding is defensible.",
      request: "Confirm component mapping against the supplier specification.",
      status: "Open",
      documentId: "capb",
      findingId: "F-02",
    },
    {
      id: "P-03",
      kind: "missing",
      label: "Missing document",
      title: "Fragrance F-17 has an SDS but no composition evidence",
      why: "An SDS is not being treated as a complete formulation disclosure in this prototype.",
      request: "Record the document gap and continue only with an explicit limitation.",
      status: "Open",
      documentId: "fragrance",
      findingId: "F-01",
    },
    {
      id: "P-04",
      kind: "ready",
      label: "Ready for bounded check",
      title: "Formula total is 100.0%",
      why: "The arithmetic preflight passed. This does not establish regulatory compliance.",
      request: "No action required.",
      status: "Ready",
      documentId: "formula",
      findingId: null,
    },
  ],
  findings: [
    {
      id: "F-01",
      subject: "Fragrance F-17",
      status: "Information missing",
      statusType: "missing",
      identity: "Fragrance — component identities unavailable",
      concentration: "0.2% raw material in finished formula",
      condition: "Rinse-off facial cleanser; adult use",
      explanation: "The raw material cannot be screened at component level because the composition evidence is missing. No pass/fail conclusion is produced.",
      sourceTitle: "Supplier composition evidence",
      provision: "Not supplied",
      version: "Not available",
      scope: "Component identity and concentration",
      uncertainty: "The contents of the fragrance mixture are unknown to the prototype.",
      action: "Pending",
      note: "",
      sourceLink: "",
      documentId: "fragrance",
    },
    {
      id: "F-02",
      subject: "Cocamidopropyl Betaine solution",
      status: "Identity unresolved",
      statusType: "unresolved",
      identity: "Declared INCI retained; component mapping not confirmed",
      concentration: "20.0% raw material in finished formula",
      condition: "Rinse-off facial cleanser; adult use",
      explanation: "The system preserves the supplier wording and asks a reviewer to confirm the mapping instead of collapsing a raw material into one ingredient name.",
      sourceTitle: "Supplier specification v2.1",
      provision: "Synthetic pilot document reference",
      version: "Demo snapshot, 10 Sep 2026",
      scope: "Raw-material identity mapping",
      uncertainty: "Component percentages and impurities have not been independently confirmed.",
      action: "Pending",
      note: "",
      sourceLink: "",
      documentId: "capb",
    },
    {
      id: "F-03",
      subject: "Phenoxyethanol",
      status: "Professional review required",
      statusType: "review",
      identity: "Phenoxyethanol · CAS 122-99-6",
      concentration: "0.8% in finished formula",
      condition: "Rinse-off facial cleanser; adult use",
      explanation: "A bounded pilot rule found a potentially relevant entry. The prototype shows the applied values and source location, but a qualified reviewer must confirm the exact condition and decision.",
      sourceTitle: "ASEAN Cosmetic Directive — ingredient annexes",
      provision: "Annex VI entry; exact condition to be verified by the pilot reviewer",
      version: "Source register: 2026-1 · retrieved 14 Sep 2026",
      scope: "Preservative restriction screening",
      uncertainty: "This is a synthetic UI demonstration, not an expert-verified case conclusion.",
      action: "Pending",
      note: "",
      sourceLink: sourceUrl,
      documentId: "formula",
    },
  ],
  audit: [
    { title: "Demo case loaded", detail: "Synthetic case SG-FC-001 · 14 Sep 2026, 23:42" },
    { title: "Preflight prepared", detail: "Three open items and one arithmetic check · Prototype engine v0" },
  ],
};

const viewRoot = document.querySelector("#view-root");
const pageTitle = document.querySelector("#page-title");
const toast = document.querySelector("#toast");
const progressStep = document.querySelector("#progress-step");
const progressCurrent = document.querySelector("#progress-current");
const documentDrawer = document.querySelector("#document-drawer");
const documentBackdrop = document.querySelector("#document-backdrop");
const documentDrawerContent = document.querySelector("#document-drawer-content");
const appShell = document.querySelector(".app-shell");

const titles = {
  cases: "Cases",
  context: "Product context",
  formula: "Formula & raw materials",
  preflight: "Preflight",
  findings: "Findings review",
  summary: "Review summary",
};

const workflowSteps = [
  { id: "cases", label: "Cases" },
  { id: "context", label: "Product context" },
  { id: "formula", label: "Formula & raw materials" },
  { id: "preflight", label: "Preflight" },
  { id: "findings", label: "Findings review" },
  { id: "summary", label: "Review summary" },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusClass(type) {
  const map = {
    missing: "status-missing",
    unresolved: "status-unresolved",
    review: "status-review",
    confirmed: "status-confirmed",
    escalated: "status-escalated",
    neutral: "status-neutral",
  };
  return map[type] || map.neutral;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2500);
}

function updateProgress() {
  const activeIndex = workflowSteps.findIndex((step) => step.id === state.activeView);
  progressStep.textContent = `Step ${activeIndex + 1} of ${workflowSteps.length}`;
  progressCurrent.textContent = `Current: ${workflowSteps[activeIndex].label}`;

  document.querySelectorAll("[data-progress-view]").forEach((item, index) => {
    item.classList.toggle("completed", state.completedViews.has(item.dataset.progressView));
    item.classList.toggle("active", index === activeIndex);
    if (index === activeIndex) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("completed", state.completedViews.has(item.dataset.view));
    item.classList.toggle("active", item.dataset.view === state.activeView);
    if (item.dataset.view === state.activeView) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

function getDrawerFinding() {
  const explicitFinding = state.findings.find((finding) => finding.id === state.drawerFindingId);
  if (explicitFinding) return explicitFinding;

  return {
    id: "SOURCE-ONLY",
    sourceTitle: "Official rule evaluation deferred",
    provision: "Not evaluated — this document view is not linked to a specific finding",
    version: "No controlled-source citation attached",
    uncertainty: "Open a specific finding before inspecting any applicable rule reference.",
    sourceLink: "",
  };
}

function renderCustomerDocument(document) {
  const extractedRows = document.extracted.map(([label, value]) => `
    <div class="extraction-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
  `).join("");

  return `
    <div class="document-meta-grid">
      <div><span>File</span><strong>${escapeHtml(document.fileName)}</strong></div>
      <div><span>Document type</span><strong>${escapeHtml(document.documentType)}</strong></div>
      <div><span>Version</span><strong>${escapeHtml(document.version)}</strong></div>
      <div><span>Page</span><strong>${escapeHtml(document.page)}</strong></div>
    </div>
    <div class="document-preview" aria-label="Original document page preview">
      <img src="${document.image}" alt="${escapeHtml(document.alt)}" />
    </div>
    <section class="extraction-card">
      <div class="extraction-card-header">
        <div>
          <span class="eyebrow">System extraction</span>
          <h3>Values carried into the review</h3>
        </div>
        <span class="status status-unresolved">Extraction simulated</span>
      </div>
      <dl class="extraction-list">${extractedRows}</dl>
      <div class="source-warning">${escapeHtml(document.limitation)}</div>
    </section>
  `;
}

function renderOfficialSource(finding) {
  const hasApplicableRule = finding.id === "F-03";
  const sourceTitle = hasApplicableRule ? finding.sourceTitle : "Official rule evaluation deferred";
  const provision = hasApplicableRule
    ? finding.provision
    : "Not evaluated — customer identity or composition evidence is incomplete";
  const sourceVersion = hasApplicableRule ? finding.version : "No controlled-source citation attached";
  return `
    <section class="official-source-card">
      <span class="eyebrow">Controlled-source reference</span>
      <h3>${escapeHtml(sourceTitle)}</h3>
      <dl class="evidence-list">
        <div class="evidence-row"><dt>Jurisdiction</dt><dd>Singapore</dd></div>
        <div class="evidence-row"><dt>Provision / reference</dt><dd>${escapeHtml(provision)}</dd></div>
        <div class="evidence-row"><dt>Source version</dt><dd>${escapeHtml(sourceVersion)}</dd></div>
        <div class="evidence-row"><dt>Known uncertainty</dt><dd>${escapeHtml(finding.uncertainty)}</dd></div>
      </dl>
      ${finding.sourceLink ? `<a class="source-link source-link-button" href="${finding.sourceLink}" target="_blank" rel="noreferrer">Open official HSA source</a>` : ""}
      <div class="source-warning">
        ${hasApplicableRule
          ? "A qualified reviewer must verify the exact provision, source version and applied condition before recording a conclusion."
          : "No rule conclusion is requested while the customer-document identity or composition gap remains unresolved."}
      </div>
    </section>
  `;
}

function renderDocumentDrawer() {
  if (!state.activeDocumentId) return;
  const document = sourceDocuments[state.activeDocumentId] || sourceDocuments.formula;
  const finding = getDrawerFinding();
  const customerSelected = state.activeDocumentTab === "customer";

  documentDrawerContent.innerHTML = `
    <header class="document-drawer-header">
      <div>
        <span class="eyebrow">Source document</span>
        <h2 id="document-drawer-title">${escapeHtml(document.title)}</h2>
        <p>Compare the submitted evidence with the values used by the review.</p>
      </div>
      <button class="drawer-close" type="button" data-close-document aria-label="Close source document">×</button>
    </header>
    <div class="drawer-synthetic-banner">
      <span class="status status-missing">Synthetic document</span>
      <span>No real customer or supplier data is shown.</span>
    </div>
    <div class="document-tabs" role="tablist" aria-label="Evidence source type">
      <button id="document-tab-customer" type="button" role="tab" aria-controls="document-tab-panel" aria-selected="${customerSelected}" tabindex="${customerSelected ? "0" : "-1"}" class="document-tab ${customerSelected ? "active" : ""}" data-document-tab="customer">Customer document</button>
      <button id="document-tab-official" type="button" role="tab" aria-controls="document-tab-panel" aria-selected="${!customerSelected}" tabindex="${!customerSelected ? "0" : "-1"}" class="document-tab ${!customerSelected ? "active" : ""}" data-document-tab="official">Official rule</button>
    </div>
    <div id="document-tab-panel" class="document-tab-panel" role="tabpanel" aria-labelledby="document-tab-${customerSelected ? "customer" : "official"}">
      ${customerSelected ? renderCustomerDocument(document) : renderOfficialSource(finding)}
    </div>
  `;

  documentDrawerContent.querySelector("[data-close-document]")?.addEventListener("click", closeDocument);
  documentDrawerContent.querySelectorAll("[data-document-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeDocumentTab = button.dataset.documentTab;
      renderDocumentDrawer();
      documentDrawerContent.querySelector(`[data-document-tab="${state.activeDocumentTab}"]`)?.focus();
    });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      state.activeDocumentTab = state.activeDocumentTab === "customer" ? "official" : "customer";
      renderDocumentDrawer();
      documentDrawerContent.querySelector(`[data-document-tab="${state.activeDocumentTab}"]`)?.focus();
    });
  });
}

function openDocument(documentId, tab = "customer", findingId = null, trigger = null) {
  state.activeDocumentId = documentId;
  state.activeDocumentTab = tab;
  state.drawerFindingId = findingId;
  state.lastSourceTrigger = trigger || document.activeElement;
  renderDocumentDrawer();
  document.body.classList.add("drawer-open");
  appShell.setAttribute("inert", "");
  documentDrawer.removeAttribute("inert");
  documentDrawer.classList.add("open");
  documentBackdrop.classList.add("open");
  documentDrawer.setAttribute("aria-hidden", "false");
  documentBackdrop.setAttribute("aria-hidden", "false");
  window.setTimeout(() => {
    const initialFocus = documentDrawerContent.querySelector(`[data-document-tab="${state.activeDocumentTab}"]`)
      || documentDrawerContent.querySelector("[data-close-document]");
    if (initialFocus) initialFocus.focus();
    else documentDrawer.focus();
  }, 50);
}

function closeDocument() {
  document.body.classList.remove("drawer-open");
  appShell.removeAttribute("inert");
  documentDrawer.setAttribute("inert", "");
  documentDrawer.classList.remove("open");
  documentBackdrop.classList.remove("open");
  documentDrawer.setAttribute("aria-hidden", "true");
  documentBackdrop.setAttribute("aria-hidden", "true");
  const previousTrigger = state.lastSourceTrigger;
  state.activeDocumentId = null;
  state.drawerFindingId = null;
  documentDrawerContent.innerHTML = "";
  if (previousTrigger instanceof HTMLElement && document.contains(previousTrigger)) previousTrigger.focus();
  state.lastSourceTrigger = null;
}

function setView(view) {
  if (state.activeDocumentId) closeDocument();
  state.activeView = view;
  pageTitle.textContent = titles[view];
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateCounts() {
  const openIssues = state.issues.filter((issue) => !["Resolved", "Ready"].includes(issue.status)).length;
  const pendingFindings = state.findings.filter((finding) => finding.action === "Pending").length;
  const preflightCount = document.querySelector("#preflight-count");
  const findingsCount = document.querySelector("#findings-count");
  preflightCount.textContent = openIssues;
  preflightCount.setAttribute("aria-label", `${openIssues} unresolved preflight ${openIssues === 1 ? "issue" : "issues"}`);
  findingsCount.textContent = pendingFindings;
  findingsCount.setAttribute("aria-label", `${pendingFindings} pending finding ${pendingFindings === 1 ? "decision" : "decisions"}`);
}

function renderCases() {
  const openIssues = state.issues.filter((issue) => issue.status === "Open").length;
  const reviewerIssues = state.issues.filter((issue) => issue.status === "Reviewer").length;
  const pendingFindings = state.findings.filter((finding) => finding.action === "Pending").length;
  const caseStatus = openIssues
    ? { label: "Needs information", className: "status-missing" }
    : reviewerIssues
      ? { label: "Needs professional review", className: "status-review" }
      : pendingFindings
        ? { label: "Review pending", className: "status-unresolved" }
        : { label: "Review prepared", className: "status-confirmed" };

  return `
    <div class="page-intro">
      <div>
        <span class="eyebrow">Professional services workspace</span>
        <h2>Prepare client evidence for qualified review</h2>
        <p>A professional review workspace for regulatory consultancies and in-house RA teams — software prepares the evidence; a qualified professional decides. The first pilot is consultancy-led, not brand self-service.</p>
      </div>
      <div class="button-row">
        <button class="btn btn-secondary" data-action="new-case">Create blank case</button>
        <button class="btn btn-primary" data-action="open-demo">Use demo case</button>
      </div>
    </div>

    <div class="audience-strip">
      <div>
        <span class="eyebrow">Primary user</span>
        <strong>Junior RA or consultant at a regulatory consultancy</strong>
      </div>
      <div class="audience-flow" aria-label="Review workflow roles">
        <span>Prepare case</span><span aria-hidden="true">→</span><span>Senior review</span><span aria-hidden="true">→</span><span>Client handoff</span>
      </div>
      <span class="status status-neutral">Buyer hypothesis: consultancy owner</span>
    </div>

    <div class="case-row">
      <div class="case-title">
        <div class="case-code">SG</div>
        <div>
          <strong>${demoCase.id} — ${demoCase.name}</strong>
          <span>Client: ${demoCase.clientAlias} · ${demoCase.engagement}</span>
        </div>
      </div>
      <div>
        <div class="case-meta-label">Status</div>
        <div class="case-meta-value"><span class="status ${caseStatus.className}">${caseStatus.label}</span></div>
      </div>
      <div>
        <div class="case-meta-label">Assigned reviewer</div>
        <div class="case-meta-value">${demoCase.reviewer}</div>
      </div>
      <button class="btn btn-secondary btn-sm" data-action="open-demo">Open case</button>
    </div>

    <div class="empty-case">
      <h3>Why only one case?</h3>
      <p>The first prototype validates one Singapore cleanser workflow with professional reviewers. Case volume, buyer choice, automation and database design come after pilot evidence.</p>
    </div>
  `;
}

function renderContext() {
  const c = demoCase.context;
  return `
    <div class="page-intro">
      <div>
        <span class="eyebrow">${demoCase.id}</span>
        <h2>Context changes which conditions may apply</h2>
        <p>The interface records product use before any bounded check. The first pilot locks jurisdiction and category to prevent accidental cross-market conclusions.</p>
      </div>
    </div>

    <form class="card card-pad" id="context-form">
      <div class="form-grid">
        <div class="field">
          <label for="jurisdiction">Target jurisdiction</label>
          <input id="jurisdiction" value="${c.jurisdiction}" disabled />
        </div>
        <div class="field">
          <label for="category">Pilot product category</label>
          <input id="category" value="${c.category}" disabled />
        </div>
        <div class="field">
          <label for="format">Exposure format</label>
          <select id="format"><option selected>${c.format}</option><option>Leave-on</option></select>
        </div>
        <div class="field">
          <label for="intended-user">Intended user</label>
          <input id="intended-user" value="${c.intendedUser}" />
        </div>
        <div class="field">
          <label for="application-area">Application area</label>
          <input id="application-area" value="${c.applicationArea}" />
        </div>
        <div class="field">
          <label for="frequency">Frequency of use</label>
          <input id="frequency" value="${c.frequency}" />
        </div>
        <div class="field">
          <label for="internal-code">Internal product code</label>
          <input id="internal-code" value="${c.internalCode}" />
        </div>
        <div class="field">
          <label for="claims">Proposed claim</label>
          <input id="claims" value="${c.claims}" />
        </div>
        <div class="field full">
          <label for="scope-note">Pilot scope note</label>
          <textarea id="scope-note">Ingredient identity, missing-information and limited source-linked checks only. Claims assessment, final classification and safety approval are outside scope.</textarea>
        </div>
      </div>
      <div class="form-footer">
        <span class="form-hint">Jurisdiction and category are locked in UI v1.</span>
        <button class="btn btn-primary" type="submit">Save and continue</button>
      </div>
    </form>
  `;
}

function renderFormula() {
  const rows = demoCase.formula.map((item) => `
    <tr>
      <td><span class="row-title">${escapeHtml(item.name)}</span><span class="cell-note">${escapeHtml(item.supplier)}</span></td>
      <td>${escapeHtml(item.use)}</td>
      <td>${escapeHtml(item.inci)}<span class="cell-note">CAS ${escapeHtml(item.cas)}</span></td>
      <td>${escapeHtml(item.composition)}</td>
      <td>
        <div class="evidence-cell">
          <span>${escapeHtml(item.docs)}</span>
          <button class="source-button" type="button" data-open-document="${escapeHtml(item.documentId)}" data-document-tab="customer" ${item.findingId ? `data-document-finding="${escapeHtml(item.findingId)}"` : ""} aria-label="View source for ${escapeHtml(item.name)}">View source</button>
        </div>
      </td>
    </tr>
  `).join("");

  return `
    <div class="page-intro">
      <div>
        <span class="eyebrow">${demoCase.id}</span>
        <h2>Preserve the raw material before normalising ingredients</h2>
        <p>Compare every normalised field with the submitted client or supplier document before carrying it into a professional review.</p>
      </div>
      <div class="button-row">
        <button class="btn btn-secondary" data-action="import-demo">Import sample spreadsheet</button>
        <button class="btn btn-primary" data-action="run-preflight">Run preflight</button>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Raw material</th>
            <th>Use level</th>
            <th>Declared identity</th>
            <th>Composition status</th>
            <th>Supporting evidence</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="prototype-disclaimer">
      The displayed source pack is synthetic. Upload, OCR and document extraction remain simulated in UI v1; no confidential file leaves the browser.
    </div>
  `;
}

function renderPreflight() {
  const issueCards = state.issues.map((issue) => {
    const displayedStatus = issue.status === "Resolved"
      ? { label: "Resolved", className: "status-confirmed" }
      : issue.status === "Reviewer"
        ? { label: "Reviewer flagged", className: "status-review" }
        : { label: issue.label, className: issue.kind === "ready" ? "status-confirmed" : issue.kind === "missing" ? "status-missing" : "status-unresolved" };

    return `
    <article class="issue-card ${issue.status === "Resolved" ? "resolved" : ""}">
      <div class="issue-icon ${issue.kind}">${issue.id.slice(-2)}</div>
      <div>
        <span class="status ${displayedStatus.className}">${escapeHtml(displayedStatus.label)}</span>
        <h3>${escapeHtml(issue.title)}</h3>
        <p>${escapeHtml(issue.request)}</p>
      </div>
      <div class="why">${escapeHtml(issue.why)}</div>
      <div class="issue-actions">
        <button class="source-button" type="button" data-open-document="${escapeHtml(issue.documentId)}" data-document-tab="customer" ${issue.findingId ? `data-document-finding="${escapeHtml(issue.findingId)}"` : ""} aria-label="View source for ${escapeHtml(issue.title)}">View source</button>
        ${issue.kind === "ready" ? `<span class="status status-confirmed">Ready</span>` : `
          <button class="issue-action" data-issue="${issue.id}" data-issue-action="resolve">${issue.status === "Resolved" ? "Resolved" : "Resolve"}</button>
          <button class="issue-action" data-issue="${issue.id}" data-issue-action="reviewer">${issue.status === "Reviewer" ? "Flagged" : "Reviewer"}</button>
        `}
      </div>
    </article>
  `;
  }).join("");

  return `
    <div class="page-intro">
      <div>
        <span class="eyebrow">${demoCase.id}</span>
        <h2>Show missing information before showing conclusions</h2>
        <p>Preflight prevents the interface from creating false confidence when identity, composition or supplier evidence is incomplete.</p>
      </div>
      <button class="btn btn-primary" data-action="continue-findings">Prepare scoped review</button>
    </div>

    <div class="coverage-bar">
      <div class="coverage-item"><strong>100.0%</strong><span>Formula total</span></div>
      <div class="coverage-item"><strong>5 / 7</strong><span>Identities resolved</span></div>
      <div class="coverage-item"><strong>6 / 7</strong><span>Composition evidence present</span></div>
      <div class="coverage-item"><strong>Limited</strong><span>Rules covered by UI demo</span></div>
    </div>

    <div class="issue-list">${issueCards}</div>
  `;
}

function renderFindings() {
  const selected = state.findings.find((finding) => finding.id === state.selectedFindingId) || state.findings[0];
  const list = state.findings.map((finding) => `
    <button class="finding-list-item ${finding.id === selected.id ? "active" : ""}" data-finding="${finding.id}">
      <span class="status ${statusClass(finding.statusType)}">${escapeHtml(finding.status)}</span>
      <strong>${escapeHtml(finding.subject)}</strong>
      <small>${escapeHtml(finding.id)} · Reviewer action: ${escapeHtml(finding.action)}</small>
    </button>
  `).join("");

  return `
    <div class="page-intro">
      <div>
        <span class="eyebrow">${demoCase.id}</span>
        <h2>Every finding should be inspectable and amendable</h2>
        <p>Select a finding, inspect the evidence and record a professional decision. The interface never presents a green “compliant” result.</p>
      </div>
      <button class="btn btn-secondary" data-action="go-summary">Review summary</button>
    </div>

    <div class="findings-layout">
      <aside class="findings-column">
        <div class="column-title">3 scoped findings</div>
        <div class="finding-list">${list}</div>
      </aside>

      <article class="finding-detail">
        <div class="finding-header">
          <div>
            <div class="finding-id">${escapeHtml(selected.id)} · ${escapeHtml(selected.subject)}</div>
            <h2>${escapeHtml(selected.status)}</h2>
          </div>
          <span class="status ${statusClass(selected.statusType)}">${escapeHtml(selected.action)}</span>
        </div>

        <dl class="detail-grid">
          <div class="detail-item"><dt>Identity used</dt><dd>${escapeHtml(selected.identity)}</dd></div>
          <div class="detail-item"><dt>Observed concentration</dt><dd>${escapeHtml(selected.concentration)}</dd></div>
          <div class="detail-item"><dt>Product context</dt><dd>${escapeHtml(selected.condition)}</dd></div>
          <div class="detail-item"><dt>Check scope</dt><dd>${escapeHtml(selected.scope)}</dd></div>
        </dl>

        <div class="explanation">${escapeHtml(selected.explanation)}</div>

        <label class="field" for="review-note">
          <span>Reviewer rationale</span>
          <textarea class="review-note" id="review-note" placeholder="Explain the evidence, amendment or reason for escalation...">${escapeHtml(selected.note)}</textarea>
        </label>
        <div class="review-actions">
          <button class="btn btn-secondary" data-review-action="Confirmed">Confirm</button>
          <button class="btn btn-secondary" data-review-action="Amended">Amend</button>
          <button class="btn btn-danger" data-review-action="Escalated">Escalate</button>
        </div>
      </article>

      <aside class="evidence-panel">
        <div class="column-title">Evidence detail</div>
        <div class="evidence-source-actions" role="group" aria-label="Compare source evidence">
          <button class="evidence-source-button" type="button" data-open-document="${escapeHtml(selected.documentId)}" data-document-tab="customer" data-document-finding="${escapeHtml(selected.id)}" aria-label="Open customer document for ${escapeHtml(selected.subject)}">Customer document</button>
          <button class="evidence-source-button" type="button" data-open-document="${escapeHtml(selected.documentId)}" data-document-tab="official" data-document-finding="${escapeHtml(selected.id)}" aria-label="Open official rule status for ${escapeHtml(selected.subject)}">Official rule</button>
        </div>
        <h3>${escapeHtml(selected.sourceTitle)}</h3>
        <dl class="evidence-list">
          <div class="evidence-row"><dt>Jurisdiction</dt><dd>Singapore</dd></div>
          <div class="evidence-row"><dt>Provision / reference</dt><dd>${escapeHtml(selected.provision)}</dd></div>
          <div class="evidence-row"><dt>Source version</dt><dd>${escapeHtml(selected.version)}</dd></div>
          <div class="evidence-row"><dt>Known uncertainty</dt><dd>${escapeHtml(selected.uncertainty)}</dd></div>
        </dl>
        ${selected.sourceLink ? `<a class="source-link" href="${selected.sourceLink}" target="_blank" rel="noreferrer">Open official HSA source</a>` : ""}
        <div class="source-warning">The presence of a source link does not make the finding final. A qualified reviewer must verify the exact provision, version and applied condition.</div>
      </aside>
    </div>
  `;
}

function renderSummary() {
  const confirmed = state.findings.filter((finding) => finding.action === "Confirmed").length;
  const amended = state.findings.filter((finding) => finding.action === "Amended").length;
  const escalated = state.findings.filter((finding) => finding.action === "Escalated").length;
  const pending = state.findings.filter((finding) => finding.action === "Pending").length;
  const unresolvedIssues = state.issues.filter((issue) => !["Resolved", "Ready"].includes(issue.status));
  const openGapSummary = unresolvedIssues.length
    ? `${unresolvedIssues.length} unresolved preflight items · ${unresolvedIssues.map((issue) => issue.id).join(", ")}`
    : "No unresolved preflight items";
  const audit = state.audit.slice().reverse().map((event) => `
    <div class="audit-event"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.detail)}</span></div>
  `).join("");

  return `
    <div class="page-intro">
      <div>
        <span class="eyebrow">${demoCase.id}</span>
        <h2>Export the scope, evidence and open questions together</h2>
        <p>The summary records what was checked, what remains unresolved and who made each professional decision.</p>
      </div>
      <div class="button-row">
        <button class="btn btn-secondary" data-action="back-findings">Return to review</button>
        <button class="btn btn-primary" data-action="export">Print / export</button>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card"><strong>${confirmed}</strong><span>Confirmed findings</span></div>
      <div class="metric-card"><strong>${amended}</strong><span>Amended findings</span></div>
      <div class="metric-card"><strong>${escalated}</strong><span>Escalated findings</span></div>
      <div class="metric-card"><strong>${pending}</strong><span>Pending decisions</span></div>
    </div>

    <div class="summary-grid">
      <section class="card card-pad">
        <span class="eyebrow">Review package</span>
        <h2>${demoCase.name}</h2>
        <div class="summary-list">
          <div class="summary-line"><span>Case ID</span><span>${demoCase.id}</span></div>
          <div class="summary-line"><span>Client</span><span>${demoCase.clientAlias}</span></div>
          <div class="summary-line"><span>Engagement</span><span>${demoCase.engagement}</span></div>
          <div class="summary-line"><span>Scoped market</span><span>Singapore</span></div>
          <div class="summary-line"><span>Product context</span><span>Adult rinse-off facial cleanser</span></div>
          <div class="summary-line"><span>Inputs snapshot</span><span>7 raw materials · formula total 100.0%</span></div>
          <div class="summary-line"><span>Open information gaps</span><span>${escapeHtml(openGapSummary)}</span></div>
          <div class="summary-line"><span>Sources shown</span><span>HSA / ACD register plus synthetic supplier references</span></div>
          <div class="summary-line"><span>Client source pack</span><span>3-page synthetic PDF · extraction simulated</span></div>
          <div class="summary-line"><span>Reviewer</span><span>${demoCase.reviewer}</span></div>
        </div>
        <div class="prototype-disclaimer">
          Synthetic demonstration output. This package is not a final compliance determination, safety assessment, product notification or professional approval.
        </div>
      </section>

      <aside class="card card-pad">
        <span class="eyebrow">Audit history</span>
        <h2>Recorded actions</h2>
        <div class="audit-list">${audit}</div>
      </aside>
    </div>
  `;
}

function render() {
  const views = {
    cases: renderCases,
    context: renderContext,
    formula: renderFormula,
    preflight: renderPreflight,
    findings: renderFindings,
    summary: renderSummary,
  };
  viewRoot.innerHTML = views[state.activeView]();
  updateCounts();
  updateProgress();
  bindViewEvents();
}

function bindViewEvents() {
  document.querySelectorAll("[data-open-document]").forEach((button) => {
    button.addEventListener("click", () => {
      openDocument(
        button.dataset.openDocument,
        button.dataset.documentTab || "customer",
        button.dataset.documentFinding || null,
        button,
      );
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "open-demo") {
        state.completedViews.add("cases");
        setView("context");
      }
      if (action === "new-case") showToast("Blank-case creation will be added after the demo flow is validated.");
      if (action === "import-demo") showToast("Synthetic spreadsheet loaded. No file was uploaded.");
      if (action === "run-preflight") {
        state.completedViews.add("formula");
        setView("preflight");
      }
      if (action === "continue-findings") {
        state.completedViews.add("preflight");
        setView("findings");
      }
      if (action === "go-summary") {
        if (state.findings.every((finding) => finding.action !== "Pending")) state.completedViews.add("findings");
        setView("summary");
      }
      if (action === "back-findings") setView("findings");
      if (action === "export") {
        state.completedViews.add("summary");
        updateProgress();
        window.print();
      }
    });
  });

  document.querySelector("#context-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.completedViews.add("context");
    state.audit.push({ title: "Product context saved", detail: "Demo reviewer · browser-only UI state" });
    showToast("Product context saved in this browser session.");
    setView("formula");
  });

  document.querySelectorAll("[data-issue-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const issue = state.issues.find((item) => item.id === button.dataset.issue);
      if (!issue) return;
      issue.status = button.dataset.issueAction === "resolve" ? "Resolved" : "Reviewer";
      state.audit.push({
        title: `${issue.id} ${issue.status.toLowerCase()}`,
        detail: `${issue.title} · Demo reviewer`,
      });
      showToast(issue.status === "Resolved" ? "Issue marked resolved for the UI demo." : "Issue flagged for professional review.");
      render();
    });
  });

  document.querySelectorAll("[data-finding]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFindingId = button.dataset.finding;
      render();
    });
  });

  document.querySelectorAll("[data-review-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const finding = state.findings.find((item) => item.id === state.selectedFindingId);
      if (!finding) return;
      const note = document.querySelector("#review-note")?.value.trim() || "No rationale entered in UI demo.";
      finding.action = button.dataset.reviewAction;
      finding.note = note;
      finding.statusType = finding.action === "Confirmed" ? "confirmed" : finding.action === "Escalated" ? "escalated" : "review";
      state.audit.push({
        title: `${finding.id} ${finding.action.toLowerCase()}`,
        detail: `${finding.subject} · ${note}`,
      });
      if (state.findings.every((item) => item.action !== "Pending")) state.completedViews.add("findings");
      showToast(`${finding.id} recorded as ${finding.action.toLowerCase()}.`);
      render();
    });
  });
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => setView(item.dataset.view));
});

documentBackdrop.addEventListener("click", closeDocument);
document.addEventListener("keydown", (event) => {
  if (!state.activeDocumentId) return;
  if (event.key === "Escape") {
    closeDocument();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = Array.from(documentDrawer.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
  if (!focusable.length) {
    event.preventDefault();
    documentDrawer.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

render();
