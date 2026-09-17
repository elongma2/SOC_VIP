import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentPage } from "./AgentPage";
import { optionsFixture, testResponse } from "../test/fixtures";
import type { AgentIngredientRow, AgentPreparedFormulation, AgentSession } from "../types/agent";

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
}

const row: AgentIngredientRow = {
  row_id: "row-2",
  source_row: 2,
  source_rows: [2],
  source_cells: ["Vitamin B3 Active", "NIACINAMIDE", "5%", "Brightening active"],
  name: { value: "NIACINAMIDE", source_value: "NIACINAMIDE", source_row: 2, source_column: "INCI", interpretation_method: "exact_catalogue_match", needs_confirmation: false, confirmed_by_user: false, source_references: [] },
  cas_number: null,
  concentration: {
    value: { value: 5, source_value: "5%", source_row: 2, source_column: "Concentration", interpretation_method: "deterministic_numeric_parse", needs_confirmation: false, confirmed_by_user: false, source_references: [] },
    unit: { value: "percent", source_value: "5%", source_row: 2, source_column: "Concentration", interpretation_method: "deterministic_explicit_unit", needs_confirmation: false, confirmed_by_user: false, source_references: [] },
    basis: { value: null, source_value: null, source_row: 2, source_column: null, interpretation_method: "not_supplied", needs_confirmation: false, confirmed_by_user: false, source_references: [] },
    preparation_stage: null,
  },
  identity_status: "high_confidence" as const,
  identity_catalogue_id: "eu-niacinamide",
  catalogue_identity: {
    ingredient_id: "eu-niacinamide",
    canonical_name: "NIACINAMIDE",
    source_name: "EU Glossary of Common Ingredient Names",
    source_document: "eu_common_ingredient_glossary_2025_1175",
    source_version: "Commission Implementing Decision (EU) 2025/1175",
    source_url: "https://example.test/eu-glossary",
    source_entries: [17380],
    source_pages: [516],
    raw_record_ids: ["raw-eu-2025-1175-entry-17380"],
    identity_dataset_version: "eu-glossary-2025-1175",
    accepted_baseline_sha256: "identity-manifest-hash",
  },
  source_metadata: [
    { source_row: 2, source_column: "RM Name", source_column_index: 0, source_value: "Vitamin B3 Active", mapped_as: "raw_material_name" },
    { source_row: 2, source_column: "Remarks", source_column_index: 3, source_value: "Brightening active", mapped_as: "notes" },
  ],
  issues: [],
};

const baseSession: AgentSession = {
  session_id: "session-1", revision: 1, state: "needs_confirmation", filename: "demo.csv",
  detected_table: { header_row: 1, data_start_row: 2, header_rows: [1], data_rows: [2], source_row_count: 1, source_column_count: 4, delimiter: "," },
  column_mappings: [], formulation_id: null, formulation_name: null, product_context: { value: null, source_value: null, source_row: 1, source_column: null, interpretation_method: "not_supplied", needs_confirmation: true, confirmed_by_user: false, source_references: [] }, interpreted_rows: [row],
  questions: [
    {
      question_id: "formulation:product_context", question_type: "product_context", title: "Product context",
      prompt: "No Product Context was found in the CSV.", source_row: null, row_id: null, blocking: true,
      options: [
        { option_id: "not_supplied", label: "Not available", value: null },
        { option_id: "context:0", label: "All products", value: "All products" },
        { option_id: "context:1", label: "Toothpaste", value: "Toothpaste" },
      ],
    },
    {
      question_id: "global:preparation_stage", question_type: "preparation_stage", title: "Preparation stage",
      prompt: "Confirm when the imported concentrations apply.", source_row: null, row_id: null, blocking: true,
      options: [{ option_id: "finished_product", label: "Finished product", value: "finished_product" }],
    },
  ],
  activity: [{ activity_id: "a1", status: "complete", message: "Read 2 CSV rows" }],
  canonical_formulation: null, error: null, model: "gpt-5.6-sol", usage: null,
};

function answeredSession(): AgentSession {
  return {
    ...baseSession, revision: 3, state: "interpreted", questions: [],
    product_context: { ...baseSession.product_context!, needs_confirmation: false, confirmed_by_user: true, interpretation_method: "user_confirmed_context_unavailable" },
    interpreted_rows: [{ ...row, concentration: { ...row.concentration!, preparation_stage: { value: "finished_product", source_value: null, source_row: 2, source_column: null, interpretation_method: "user_confirmed_global_stage", needs_confirmation: false, confirmed_by_user: true, source_references: [] } } }],
  };
}

function contextAnsweredSession(): AgentSession {
  return {
    ...baseSession,
    revision: 2,
    product_context: { ...baseSession.product_context!, needs_confirmation: false, confirmed_by_user: true, interpretation_method: "user_confirmed_context_unavailable" },
    questions: baseSession.questions.filter((question) => question.question_type !== "product_context"),
  };
}

function preparedFixture(): AgentPreparedFormulation {
  const session = { ...answeredSession(), revision: 3, state: "ready" as const };
  return {
    session,
    formulation: { formulation_id: null, formulation_name: null, product_context: null, ingredients: [{ name: "NIACINAMIDE", cas_number: null, concentration: { value: 5, unit: "percent", basis: null, preparation_stage: "finished_product" } }] },
    row_provenance: session.interpreted_rows,
  };
}

describe("Formulation Agent page", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requires confirmation and does not screen until Confirm & Screen", async () => {
    const prepared = preparedFixture();
    const oneResult = structuredClone(testResponse);
    oneResult.summary.ingredients_submitted = 1;
    oneResult.ingredient_results = [oneResult.ingredient_results[0]];
    let answerCount = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return json(optionsFixture);
      if (url.endsWith("/agent/formulations")) return json(baseSession, 201);
      if (url.endsWith("/answers")) return json(answerCount++ === 0 ? contextAnsweredSession() : answeredSession());
      if (url.endsWith("/prepare")) return json(prepared);
      if (url.endsWith("/screen-formulation")) return json(oneResult);
      return json({}, 404);
    });
    const user = userEvent.setup();
    render(<AgentPage />);
    const file = new File(["INCI,Concentration\nNIACINAMIDE,5%"], "demo.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("Choose formulation CSV"), file);
    expect(await screen.findByText("Analysis complete")).toBeInTheDocument();
    expect(screen.getByText("Source value → structured value")).toBeInTheDocument();
    expect(screen.getAllByText("Preparation stage").length).toBeGreaterThan(0);
    expect(within(screen.getByLabelText("Resolve Product context")).getByRole("option", { name: "Toothpaste" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/screen-formulation"))).toBe(false);

    await user.selectOptions(screen.getByLabelText("Resolve Product context"), "not_supplied");
    await user.click(screen.getByRole("button", { name: "Confirm context" }));
    await user.click(screen.getByRole("button", { name: "Finished product" }));
    expect(await screen.findByRole("button", { name: "Prepare formulation" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Prepare formulation" }));
    expect(await screen.findByText("Formulation ready for screening")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/screen-formulation"))).toBe(false);

    await user.click(screen.getByRole("button", { name: /Confirm & Screen/ }));
    expect(await screen.findByText(/Imported by Formulation Agent/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/screen-formulation"))).toHaveLength(1);
  });

  it("keeps source evidence out of the pre-screen interpretation table", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return json(optionsFixture);
      if (url.endsWith("/agent/formulations")) return json(baseSession, 201);
      return json({}, 404);
    });
    const user = userEvent.setup();
    render(<AgentPage />);
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["INCI,Concentration\nNIACINAMIDE,5%"], "demo.csv", { type: "text/csv" }));

    expect(await screen.findByText("high confidence")).toBeInTheDocument();
    expect(screen.queryByText("View source")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View identity evidence/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Identity evidence")).not.toBeInTheDocument();
  });

  it("shows recoverable model failures and retries without another upload", async () => {
    const failed = { ...baseSession, state: "failed" as const, interpreted_rows: [], questions: [], error: { code: "agent_not_configured", message: "Set OPENAI_API_KEY and retry.", recoverable: true } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return json(optionsFixture);
      if (url.endsWith("/agent/formulations")) return json(failed, 201);
      if (url.endsWith("/retry")) return json(baseSession);
      return json({}, 404);
    });
    const user = userEvent.setup();
    render(<AgentPage />);
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["INCI\nNIACINAMIDE"], "demo.csv", { type: "text/csv" }));
    expect(await screen.findByText("Set OPENAI_API_KEY and retry.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Retry/ }));
    expect(await screen.findByText("Analysis complete")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/agent/formulations"))).toHaveLength(1);
  });

  it("shows imported field provenance inside the existing evidence drawer", async () => {
    const prepared = preparedFixture();
    const oneResult = structuredClone(testResponse);
    oneResult.summary.ingredients_submitted = 1;
    oneResult.ingredient_results = [oneResult.ingredient_results[0]];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return json(optionsFixture);
      if (url.endsWith("/agent/formulations")) return json({ ...prepared.session, state: "interpreted", canonical_formulation: null }, 201);
      if (url.endsWith("/prepare")) return json(prepared);
      if (url.endsWith("/screen-formulation")) return json(oneResult);
      return json({}, 404);
    });
    const user = userEvent.setup();
    render(<AgentPage />);
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["INCI\nNIACINAMIDE"], "demo.csv", { type: "text/csv" }));
    await user.click(await screen.findByRole("button", { name: "Prepare formulation" }));
    await user.click(await screen.findByRole("button", { name: /Confirm & Screen/ }));
    const drawer = await screen.findByLabelText("Regulatory evidence");
    expect(within(drawer).getByText("Input provenance")).toBeInTheDocument();
    expect(within(drawer).getByText("demo.csv")).toBeInTheDocument();
    expect(within(drawer).getAllByText("NIACINAMIDE")).toHaveLength(2);
    expect(within(drawer).getByText("Vitamin B3 Active")).toBeInTheDocument();
    expect(within(drawer).getByText("Brightening active")).toBeInTheDocument();
  });
});
