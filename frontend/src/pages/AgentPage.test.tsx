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
  unresolved_fields: [{ target_field: "preparation_stage", uncertainty_code: "preparation_stage", source_value: null, proposed_value: null }],
};

const baseSession: AgentSession = {
  session_id: "session-1", revision: 1, state: "needs_confirmation", filename: "demo.csv",
  detected_table: { header_row: 1, data_start_row: 2, header_rows: [1], data_rows: [2], source_row_count: 1, source_column_count: 4, delimiter: "," },
  column_mappings: [], formulation_id: null, formulation_name: null, product_context: { value: null, source_value: null, source_row: 1, source_column: null, interpretation_method: "not_supplied", needs_confirmation: true, confirmed_by_user: false, source_references: [] }, interpreted_rows: [row],
  questions: [
    {
      question_id: "formulation:product_context", question_type: "product_context", title: "Product context",
      prompt: "No Product Context was found in the CSV.", source_row: null, row_id: null, target_field: "product_context", uncertainty_code: "product_context", affected_row_ids: [], blocking: true,
      options: [
        { option_id: "not_supplied", label: "Not available", value: null },
        { option_id: "context:0", label: "All products", value: "All products" },
        { option_id: "context:1", label: "Toothpaste", value: "Toothpaste" },
      ],
    },
    {
      question_id: "global:preparation_stage", question_type: "preparation_stage", title: "Preparation stage",
      prompt: "Confirm when the imported concentrations apply.", source_row: null, row_id: null, target_field: "preparation_stage", uncertainty_code: "preparation_stage", affected_row_ids: ["row-2"], blocking: true,
      options: [{ option_id: "finished_product", label: "Finished product", value: "finished_product" }],
    },
  ],
  activity: [{ activity_id: "a1", status: "complete", message: "Read 2 CSV rows" }],
  canonical_formulation: null, error: null, model: "gpt-5.6-sol", usage: null,
  attempts: 0, successful_attempt: null, attempt_diagnostics: [], total_usage: null,
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

function identitySession(): AgentSession {
  const identityRow: AgentIngredientRow = {
    ...row,
    row_id: "row-10",
    source_row: 10,
    source_rows: [10],
    name: { ...row.name, value: "GLYCERIN", source_value: "Glycerine", source_row: 10, interpretation_method: "agent_identity_candidate", needs_confirmation: true },
    concentration: null,
    identity_status: "needs_confirmation",
    identity_catalogue_id: "eu-glycerin",
    catalogue_identity: { ...row.catalogue_identity!, ingredient_id: "eu-glycerin", canonical_name: "GLYCERIN" },
    unresolved_fields: [{ target_field: "ingredient_name", uncertainty_code: "ingredient_identity", source_value: "Glycerine", proposed_value: "GLYCERIN" }],
  };
  return {
    ...baseSession,
    revision: 7,
    product_context: { ...baseSession.product_context!, needs_confirmation: false, confirmed_by_user: true },
    interpreted_rows: [identityRow],
    questions: [{
      question_id: "identity:row-10", question_type: "identity", title: "Ingredient identity",
      prompt: 'Possible source-backed match: "GLYCERIN".', source_row: 10, row_id: "row-10",
      target_field: "ingredient_name", uncertainty_code: "ingredient_identity", affected_row_ids: ["row-10"], blocking: true,
      options: [
        { option_id: "confirm_candidate", label: "Use GLYCERIN", value: "GLYCERIN" },
        { option_id: "keep_source", label: "Keep source value", value: "Glycerine" },
      ],
    }],
  };
}

function resolvedIdentitySession(): AgentSession {
  const session = identitySession();
  return {
    ...session,
    revision: 8,
    state: "interpreted",
    questions: [],
    interpreted_rows: [{
      ...session.interpreted_rows[0],
      name: { ...session.interpreted_rows[0].name, value: "GLYCERIN", needs_confirmation: false, confirmed_by_user: true },
      identity_status: "confirmed",
      unresolved_fields: [],
    }],
  };
}

function keptSourceIdentitySession(): AgentSession {
  const session = identitySession();
  return {
    ...session,
    revision: 8,
    state: "interpreted",
    questions: [],
    interpreted_rows: [{
      ...session.interpreted_rows[0],
      name: {
        ...session.interpreted_rows[0].name,
        value: "Glycerine",
        needs_confirmation: false,
        confirmed_by_user: true,
        interpretation_method: "user_confirmed_source_identity",
      },
      identity_status: "unresolved",
      unresolved_fields: [],
    }],
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
    expect(within(screen.getByLabelText("Agent Product context")).getByRole("option", { name: "Toothpaste" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/screen-formulation"))).toBe(false);

    await user.selectOptions(screen.getByLabelText("Agent Product context"), "Toothpaste");
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

    expect(await screen.findByRole("button", { name: "Needs confirmation · 1 issue" })).toBeInTheDocument();
    expect(screen.queryByText("View source")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View identity evidence/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Identity evidence")).not.toBeInTheDocument();
  });

  it("shows the affected row and resolves an identity clarification from a direct row edit", async () => {
    let answerBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return json(optionsFixture);
      if (url.endsWith("/agent/formulations")) return json(identitySession(), 201);
      if (url.endsWith("/answers")) {
        answerBody = JSON.parse(String(init?.body));
        return json(resolvedIdentitySession());
      }
      return json({}, 404);
    });
    const user = userEvent.setup();
    render(<AgentPage />);
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["INCI\nGlycerine"], "identity.csv", { type: "text/csv" }));

    expect(await screen.findByText("Row 10 · Glycerine")).toBeInTheDocument();
    expect(screen.getByText("Possible source-backed match")).toBeInTheDocument();
    const name = screen.getByLabelText("Row 10 interpreted name");
    await user.clear(name);
    await user.type(name, "GLYCERIN");
    await user.tab();

    await waitFor(() => expect(screen.queryByText("Possible source-backed match")).not.toBeInTheDocument());
    expect(answerBody).toMatchObject({ row_updates: [{ row_id: "row-10", name: "GLYCERIN" }] });
    expect(screen.getByRole("button", { name: "Resolved" })).toBeInTheDocument();
  });

  it("updates the canonical row when a clarification candidate is selected", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return json(optionsFixture);
      if (url.endsWith("/agent/formulations")) return json(identitySession(), 201);
      if (url.endsWith("/answers")) return json(resolvedIdentitySession());
      return json({}, 404);
    });
    const user = userEvent.setup();
    render(<AgentPage />);
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["INCI\nGlycerine"], "identity.csv", { type: "text/csv" }));
    await user.click(await screen.findByRole("button", { name: "Use GLYCERIN" }));

    expect(await screen.findByLabelText("Row 10 interpreted name")).toHaveValue("GLYCERIN");
    expect(screen.queryByRole("button", { name: "Use GLYCERIN" })).not.toBeInTheDocument();
  });

  it("shows a completed row as resolved even when optional fields are blank", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return json(optionsFixture);
      if (url.endsWith("/agent/formulations")) return json(identitySession(), 201);
      if (url.endsWith("/answers")) return json(keptSourceIdentitySession());
      return json({}, 404);
    });
    const user = userEvent.setup();
    render(<AgentPage />);
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["INCI\nGlycerine"], "identity.csv", { type: "text/csv" }));
    await user.click(await screen.findByRole("button", { name: "Keep source value" }));

    expect(await screen.findByRole("button", { name: "Resolved" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unresolved" })).not.toBeInTheDocument();
    expect(screen.queryByText("Possible source-backed match")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Row 10 concentration")).toHaveValue("");
  });

  it("starts a new CSV and clears the current in-memory workflow", async () => {
    let uploadCount = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return json(optionsFixture);
      if (url.endsWith("/agent/formulations")) {
        uploadCount += 1;
        return json({ ...baseSession, session_id: `session-${uploadCount}`, filename: uploadCount === 1 ? "first.csv" : "second.csv" }, 201);
      }
      return json({}, 404);
    });
    const user = userEvent.setup();
    render(<AgentPage />);
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["INCI\nNIACINAMIDE"], "first.csv", { type: "text/csv" }));
    expect(await screen.findByText("first.csv")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start new CSV" }));
    expect(screen.getByText("Drop formulation CSV here")).toBeInTheDocument();
    expect(screen.queryByText("first.csv")).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["INCI\nGLYCERIN"], "second.csv", { type: "text/csv" }));
    expect(await screen.findByText("second.csv")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/agent/formulations"))).toHaveLength(2);
  });

  it("shows recoverable model failures and retries without another upload", async () => {
    const totalUsage = { configured_model: "gpt-5.6-sol", actual_model: "gpt-5.6-sol", input_tokens: 300, output_tokens: 60, total_tokens: 360, tool_calls: 2, request_rounds: 3, cache_hits: 0, response_ids: ["resp-1", "resp-2"] };
    const diagnostics = [1, 2, 3].map((attempt) => ({ attempt_number: attempt, status: "failure" as const, failure_category: "structured_output", configured_model: "gpt-5.6-sol", actual_model: "gpt-5.6-sol", response_ids: [`resp-${attempt}`], input_tokens: 100, output_tokens: 20, total_tokens: 120, tool_calls: attempt === 1 ? 2 : 0, request_rounds: 1 }));
    const failed = { ...baseSession, state: "failed" as const, interpreted_rows: [], questions: [], error: { code: "agent_invalid_structured_output", message: "Regulens tried to interpret this formulation but could not produce a reliable structured result. Your uploaded file has been preserved.", recoverable: true }, attempts: 3, successful_attempt: null, attempt_diagnostics: diagnostics, usage: totalUsage, total_usage: totalUsage };
    const recovered = { ...baseSession, attempts: 4, successful_attempt: 4, attempt_diagnostics: [...diagnostics, { attempt_number: 4, status: "success" as const, failure_category: null, configured_model: "gpt-5.6-sol", actual_model: "gpt-5.6-sol", response_ids: ["resp-4"], input_tokens: 100, output_tokens: 20, total_tokens: 120, tool_calls: 0, request_rounds: 1 }], usage: { ...totalUsage, input_tokens: 400, output_tokens: 80, total_tokens: 480, response_ids: ["resp-1", "resp-2", "resp-4"] }, total_usage: { ...totalUsage, input_tokens: 400, output_tokens: 80, total_tokens: 480, response_ids: ["resp-1", "resp-2", "resp-4"] } };
    let resolveRetry!: (response: Response) => void;
    const retryResponse = new Promise<Response>((resolve) => { resolveRetry = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return json(optionsFixture);
      if (url.endsWith("/agent/formulations")) return json(failed, 201);
      if (url.endsWith("/retry")) return retryResponse;
      return json({}, 404);
    });
    const user = userEvent.setup();
    render(<AgentPage />);
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["INCI\nNIACINAMIDE"], "demo.csv", { type: "text/csv" }));
    expect(await screen.findByText(/uploaded file has been preserved/)).toBeInTheDocument();
    expect(screen.getAllByText("Interpretation could not be completed").length).toBeGreaterThan(0);
    expect(screen.getByText("Technical activity")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Retry/ }));
    expect(screen.getByText("Interpreting formulation")).toBeInTheDocument();
    expect(screen.getByText("Regulens is identifying the formulation structure and ingredient fields.")).toBeInTheDocument();
    resolveRetry({ ok: true, status: 200, json: async () => recovered } as Response);
    expect(await screen.findByText("Analysis complete")).toBeInTheDocument();
    expect(screen.getByText(/4 attempts · successful attempt 4/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/agent/formulations"))).toHaveLength(1);
  });

  it("keeps the interpreted session visible when a later action reports expiry", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/screening-options")) return json(optionsFixture);
      if (url.endsWith("/agent/formulations")) return json(baseSession, 201);
      if (url.endsWith("/answers")) return json({ detail: { code: "agent_session_expired", message: "This Agent session has expired. Upload the CSV again to continue." } }, 410);
      return json({}, 404);
    });
    const user = userEvent.setup();
    render(<AgentPage />);
    await user.upload(screen.getByLabelText("Choose formulation CSV"), new File(["INCI\nNIACINAMIDE"], "demo.csv", { type: "text/csv" }));
    expect(await screen.findByText("Analysis complete")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Agent Product context"), "Toothpaste");
    expect(await screen.findByRole("alert")).toHaveTextContent("This Agent session has expired. Upload the CSV again to continue.");
    expect(screen.getByText("demo.csv")).toBeInTheDocument();
    expect(screen.getByLabelText("Row 2 interpreted name")).toHaveValue("NIACINAMIDE");
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
