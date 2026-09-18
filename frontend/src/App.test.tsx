import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { optionsFixture, testResponse } from "./test/fixtures";
import type { AgentPreparedFormulation, AgentSession } from "./types/agent";

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
}

function mockSuccessfulApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    return url.endsWith("/screening-options")
      ? jsonResponse(optionsFixture)
      : jsonResponse(testResponse);
  });
}

const persistedAgentSession: AgentSession = {
  session_id: "persisted-session",
  revision: 1,
  state: "interpreted",
  filename: "persistent-demo.csv",
  detected_table: { header_row: 1, data_start_row: 2, header_rows: [1], data_rows: [2], source_row_count: 1, source_column_count: 2, delimiter: "," },
  column_mappings: [],
  formulation_id: null,
  formulation_name: null,
  product_context: { value: null, source_value: null, source_row: 1, source_column: null, interpretation_method: "not_supplied", needs_confirmation: false, confirmed_by_user: true, source_references: [] },
  interpreted_rows: [{
    row_id: "row-2",
    source_row: 2,
    source_rows: [2],
    source_cells: ["NIACINAMIDE", "5%"],
    name: { value: "NIACINAMIDE", source_value: "NIACINAMIDE", source_row: 2, source_column: "Ingredient", interpretation_method: "exact_catalogue_match", needs_confirmation: false, confirmed_by_user: false, source_references: [] },
    cas_number: null,
    concentration: {
      value: { value: 5, source_value: "5%", source_row: 2, source_column: "Concentration", interpretation_method: "deterministic_numeric_parse", needs_confirmation: false, confirmed_by_user: false, source_references: [] },
      unit: { value: "percent", source_value: "5%", source_row: 2, source_column: "Concentration", interpretation_method: "deterministic_explicit_unit", needs_confirmation: false, confirmed_by_user: false, source_references: [] },
      basis: { value: null, source_value: null, source_row: 2, source_column: null, interpretation_method: "not_supplied", needs_confirmation: false, confirmed_by_user: false, source_references: [] },
      preparation_stage: { value: "finished_product", source_value: "finished_product", source_row: 2, source_column: "Stage", interpretation_method: "exact_source_value", needs_confirmation: false, confirmed_by_user: false, source_references: [] },
    },
    identity_status: "high_confidence",
    identity_catalogue_id: "eu-niacinamide",
    catalogue_identity: null,
    source_metadata: [],
    issues: [],
    unresolved_fields: [],
  }],
  questions: [],
  activity: [{ activity_id: "read", status: "complete", message: "Read 2 CSV rows" }],
  canonical_formulation: null,
  error: null,
  model: "gpt-5.6-sol",
  usage: null,
  attempts: 0,
  successful_attempt: null,
  attempt_diagnostics: [],
  total_usage: null,
};

function persistedPrepared(): AgentPreparedFormulation {
  return {
    session: { ...persistedAgentSession, revision: 2, state: "ready" },
    formulation: {
      formulation_id: null,
      formulation_name: "Persistent formula",
      product_context: null,
      ingredients: [{ name: "NIACINAMIDE", cas_number: null, concentration: { value: 5, unit: "percent", basis: null, preparation_stage: "finished_product" } }],
    },
    row_provenance: persistedAgentSession.interpreted_rows,
  };
}

describe("formula screening vertical slice", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders Regulens branding and only the active MVP workflows", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText("Regulens")).toBeInTheDocument();
    const logo = screen.getByRole("img", { name: "Regulens logo" });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", expect.stringContaining("regulens-logo-mark"));
    expect(document.querySelector('svg[aria-label="Regulens inspection mark"]')).not.toBeInTheDocument();
    expect(screen.queryByText("AseanCos")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByText("History")).not.toBeInTheDocument();
    expect(screen.queryByText("About")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Screen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sources" })).toBeInTheDocument();
    expect(screen.getByText("Singapore screening scope")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Singapore/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agent" }));
    expect(screen.getByRole("heading", { name: /Turn a formulation file into screening input/ })).toBeInTheDocument();
  });

  it("keeps Agent edits, prepared output, and screening results mounted across workflow navigation", async () => {
    const prepared = persistedPrepared();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return jsonResponse(optionsFixture);
      if (url.endsWith("/agent/formulations")) return jsonResponse(persistedAgentSession, 201);
      if (url.endsWith("/prepare")) return jsonResponse(prepared);
      if (url.endsWith("/screen-formulation")) return jsonResponse(testResponse);
      return jsonResponse({}, 404);
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Agent" }));
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["Ingredient,Concentration\nNIACINAMIDE,5%"], "persistent-demo.csv", { type: "text/csv" }));
    expect(await screen.findByText("Analysis complete")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Row 2 interpreted name"));
    await user.type(screen.getByLabelText("Row 2 interpreted name"), "NIACINAMIDE EDIT");
    const agentView = document.querySelector<HTMLElement>('[data-view="agent"]')!;
    const formulationName = within(agentView).getByText("Formulation name").closest("label")!.querySelector("input")!;
    await user.type(formulationName, "Persistent formula");

    await user.click(screen.getByRole("button", { name: "Sources" }));
    expect(screen.getByRole("heading", { name: "ACD regulatory search" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agent" }));
    expect(screen.getByLabelText("Row 2 interpreted name")).toHaveValue("NIACINAMIDE EDIT");
    expect(formulationName).toHaveValue("Persistent formula");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/agent/formulations"))).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Prepare formulation" }));
    expect(await screen.findByText("Formulation ready for screening")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Confirm & Screen/ }));
    expect(await screen.findByText(/Imported by Formulation Agent/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New Screen" }));
    await user.click(screen.getByRole("button", { name: "Agent" }));
    expect(screen.getByText(/Imported by Formulation Agent/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/screen-formulation"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/screening-options"))).toHaveLength(2);
  });

  it("allows an Agent upload to finish while its workflow is hidden", async () => {
    let resolveUpload!: (value: Response) => void;
    const uploadPromise = new Promise<Response>((resolve) => { resolveUpload = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return jsonResponse(optionsFixture);
      if (url.endsWith("/agent/formulations")) return uploadPromise;
      return jsonResponse({}, 404);
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Agent" }));
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["Ingredient\nNIACINAMIDE"], "pending.csv", { type: "text/csv" }));
    expect(screen.getByText("Interpreting formulation")).toBeInTheDocument();
    expect(screen.getByText("Regulens is identifying the formulation structure and ingredient fields.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sources" }));
    resolveUpload({ ok: true, status: 201, json: async () => persistedAgentSession } as Response);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/agent/formulations"))).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Agent" }));
    expect(await screen.findByText("Analysis complete")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/agent/formulations"))).toHaveLength(1);
  });

  it("screens TEST-001 and renders row-based results from the API", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));

    expect(await screen.findByText("3 of 3 ingredients require attention")).toBeInTheDocument();
    expect(screen.getByText("2 deterministic regulatory findings · 1 unresolved identity")).toBeInTheDocument();
    expect(screen.getAllByText("Prohibited-list substance identified").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/A1136/).length).toBeGreaterThan(0);
    const aminoRow = screen.getAllByText("Aminophylline").find((element) => element.closest("tr"))!.closest("tr")!;
    expect(within(aminoRow).getByText("—")).toBeInTheDocument();
    expect(within(aminoRow).getByText(/Regulation 6\(1\)/)).toBeInTheDocument();

    const reviewCard = screen.getByText("Needs human review").closest<HTMLElement>(".summary-card")!;
    expect(within(reviewCard).getByText("0")).toBeInTheDocument();
    expect(screen.getByText("1 ingredient requires human review")).toBeInTheDocument();
    expect(screen.getByText(/Screening scope: Singapore ingredient rules covered by the current MVP/)).toBeInTheDocument();
  });

  it("labels an ACD counterpart CAS separately from the submitted CAS", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    const tosylRow = (await screen.findAllByText("Tosylchloramide sodium"))
      .find((element) => element.closest("tr"))!;
    await user.click(tosylRow);

    const drawer = screen.getByLabelText("Regulatory evidence");
    expect(within(drawer).getByText("Submitted CAS")).toBeInTheDocument();
    expect(within(drawer).getByText("Source-backed identifier")).toBeInTheDocument();
    expect(within(drawer).getByText("CAS 127-65-1 · Annex III")).toBeInTheDocument();
    expect(within(drawer).getByText("Accepted snapshot · version in force 1 Dec 2025")).toBeInTheDocument();
    const crop = within(drawer).getByRole("img", { name: /Accepted PDF row.*reference 5/ });
    expect(crop).toHaveAttribute("src", "/api/source-evidence/raw-sg-5");
    expect(crop.getAttribute("src")).not.toMatch(/bbox|page=|source=/);
    expect(within(drawer).getByRole("link", { name: /Open official source/ })).toHaveAttribute(
      "href", "https://sso.agc.gov.sg/SL/HPA2007-S683-2007",
    );
  });

  it("renders readable ACD comparisons without exposing technical provenance", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    const tosylRow = (await screen.findAllByText("Tosylchloramide sodium"))
      .find((element) => element.closest("tr"))!;
    await user.click(tosylRow);
    const drawer = screen.getByLabelText("Regulatory evidence");
    const acdDetails = within(drawer).getByText("ACD comparison").closest("details")!;
    await user.click(within(acdDetails).getByText("ACD comparison"));
    expect(within(acdDetails).getByText("Product context")).toBeInTheDocument();
    expect(within(acdDetails).getByText("Ready for use")).toBeInTheDocument();
    expect(within(acdDetails).getByText("Finished product")).toBeInTheDocument();
    expect(within(acdDetails).getByText("The ACD and Singapore records differ. Compare the source wording before deciding.")).toBeInTheDocument();
    expect(within(drawer).queryByText("Technical provenance")).not.toBeInTheDocument();
    expect(within(drawer).queryByText(/\[parent\]/)).not.toBeInTheDocument();
  });

  it("shows plain-language field help and readable enum labels", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByLabelText("About Product context"));
    expect(screen.getByText(/same ingredient may have different restrictions/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("About Preparation stage"));
    expect(screen.getByText(/does not convert a packaged-product concentration/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("About Concentration basis"));
    expect(screen.getByText(/No specific basis means the request sends JSON null/)).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "No specific basis" })).toHaveLength(3);
    expect(screen.getAllByRole("option", { name: "Finished product" }).length).toBeGreaterThan(0);
  });

  it("opens the full accepted page from the trusted raw-record route", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    const tosylRow = (await screen.findAllByText("Tosylchloramide sodium"))
      .find((element) => element.closest("tr"))!;
    await user.click(tosylRow);
    await user.click(screen.getByRole("button", { name: "View full accepted page" }));
    const modal = screen.getByRole("dialog", { name: "Accepted source page" });
    expect(within(modal).getByRole("img")).toHaveAttribute("src", "/api/source-evidence/raw-sg-5/page");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Accepted source page" })).not.toBeInTheDocument();
  });

  it("keeps textual evidence available when the crop cannot load", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    const tosylRow = (await screen.findAllByText("Tosylchloramide sodium"))
      .find((element) => element.closest("tr"))!;
    await user.click(tosylRow);
    fireEvent.error(screen.getByRole("img", { name: /Accepted PDF row.*reference 5/ }));
    expect(screen.getByText(/accepted source row could not be rendered/i)).toBeInTheDocument();
    expect(screen.getByText("5 | Tosylchloramide sodium | All products | 0.2% | |")).toBeInTheDocument();
  });

  it("does not introduce a product-level regulatory conclusion", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    const visibleText = document.body.textContent?.toLowerCase() ?? "";
    expect(visibleText).not.toMatch(/\b(compliant|approved|legal|safe|pass|fail)\b/);
  });

  it("sends null while concentration is disabled and exposes defaults when enabled", async () => {
    const fetchMock = mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());

    const toggle = screen.getByLabelText("Enable concentration for ingredient 1");
    await user.click(toggle);
    expect(screen.getByLabelText("Ingredient 1 concentration unit")).toHaveValue("percent");
    expect(screen.getByLabelText("Ingredient 1 concentration basis")).toHaveValue("");
    expect(screen.getByLabelText("Ingredient 1 preparation stage")).toHaveValue("finished_product");
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    await screen.findByText("3 of 3 ingredients require attention");
    const post = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/screen-formulation"))!;
    const sent = JSON.parse(String((post[1] as RequestInit).body));
    expect(sent.ingredients[0].concentration).toBeNull();
  });

  it("prevents double submission and displays the loading state", async () => {
    let resolvePost!: (value: Response) => void;
    const postPromise = new Promise<Response>((resolve) => { resolvePost = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      String(input).endsWith("/screening-options") ? jsonResponse(optionsFixture) : postPromise,
    );
    const user = userEvent.setup();
    render(<App />);
    const button = await screen.findByRole("button", { name: "Run screen" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(screen.getByRole("button", { name: "Screening…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Screening…" }));
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/screen-formulation"))).toHaveLength(1);
    resolvePost({ ok: true, status: 200, json: async () => testResponse } as Response);
    await screen.findByText("3 of 3 ingredients require attention");
  });

  it("shows FastAPI validation errors without treating them as findings", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      String(input).endsWith("/screening-options")
        ? jsonResponse(optionsFixture)
        : jsonResponse({ detail: [{ loc: ["body", "ingredients", 0, "cas_number"], msg: "CAS number must have valid syntax and checksum" }] }, 422),
    );
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    expect(await screen.findByText("CAS number must have valid syntax and checksum")).toBeInTheDocument();
    expect(screen.queryByText(/ingredients require attention/)).not.toBeInTheDocument();
  });

  it("fails closed when screening options report a baseline integrity failure", async () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(jsonResponse({ detail: { code: "accepted_baseline_integrity_failure", message: "hash mismatch" } }, 503));
    render(<App />);
    expect(await screen.findByText("Regulatory dataset integrity verification failed. Screening is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run screen" })).toBeDisabled();
  });
});
