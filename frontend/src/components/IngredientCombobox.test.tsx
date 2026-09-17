import { act, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IngredientCombobox } from "./IngredientCombobox";
import { searchACDIngredients, searchIngredients } from "../api/screening";

vi.mock("../api/screening", () => ({ searchIngredients: vi.fn(), searchACDIngredients: vi.fn() }));

const result = {
  ingredient_id: "eu-2025-1175-entry-17380",
  canonical_name: "NIACINAMIDE",
  display_name: "Niacinamide",
  identity_source: "EU Glossary of Common Ingredient Names",
  source_document: "eu_common_ingredient_glossary_2025_1175",
  source_version: "Commission Implementing Decision (EU) 2025/1175",
  source_entries: [17380],
  source_pages: [516],
  raw_record_ids: ["raw-eu-2025-1175-entry-17380"],
};

const acdResult = {
  rule_id: "acd-iii-14",
  substance_id: "substance-acd-iii-14",
  name: "Hydroquinone",
  annex: "Annex III Part 1" as const,
  reference: "14",
  cas_numbers: ["123-31-9"],
  restriction_type: "restricted",
  product_context: "Artificial nail systems",
  concentration: null,
  concentration_text: "0.02% after mixing for use",
  other_conditions: null,
  required_warning: null,
  source_text: "14 | Hydroquinone",
  source_pages: [103],
  raw_record_id: "raw-acd-iii-14",
  source_version: "2026-1, 22 June 2026",
  source_url: "https://file.go.gov.sg/annexes.pdf",
  normalization_status: "normalized",
  review_reasons: [],
  manual_review_required: false,
};

function Harness() {
  const [value, setValue] = useState("");
  return <IngredientCombobox rowNumber={1} value={value} disabled={false} invalid={false} onChange={setValue} />;
}

describe("IngredientCombobox", () => {
  beforeEach(() => {
    vi.mocked(searchIngredients).mockReset();
    vi.mocked(searchACDIngredients).mockReset();
    vi.mocked(searchIngredients).mockResolvedValue({ query: "", dataset_version: "v", accepted_baseline_sha256: "h", results: [] });
    vi.mocked(searchACDIngredients).mockResolvedValue({ query: "", dataset_version: "v", accepted_baseline_sha256: "h", results: [] });
  });

  it("searches for nia and selects the exact canonical name", async () => {
    vi.mocked(searchIngredients).mockResolvedValue({
      query: "nia",
      dataset_version: "eu-glossary-2025-1175",
      accepted_baseline_sha256: "hash",
      results: [result],
    });
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Ingredient 1 name" });
    await user.type(input, "nia");
    expect(await screen.findByText("Niacinamide")).toBeInTheDocument();
    expect(screen.getByText("Recognised ingredient name")).toBeInTheDocument();
    expect(screen.getByText("EU Glossary of Common Ingredient Names")).toBeInTheDocument();
    expect(searchACDIngredients).not.toHaveBeenCalled();
    await user.click(screen.getByRole("option", { name: /Niacinamide/ }));
    expect(input).toHaveValue("NIACINAMIDE");
  });

  it("supports keyboard selection and Escape", async () => {
    vi.mocked(searchIngredients).mockResolvedValue({ query: "nia", dataset_version: "v", accepted_baseline_sha256: "h", results: [result] });
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "nia");
    await screen.findByRole("option");
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("NIACINAMIDE");
    await user.clear(input);
    await user.type(input, "nia");
    await screen.findByRole("option");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps unknown free text and shows a no-result state", async () => {
    vi.mocked(searchIngredients).mockResolvedValue({ query: "mystery", dataset_version: "v", accepted_baseline_sha256: "h", results: [] });
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "mystery");
    expect(await screen.findByText("No result found in the selected sources")).toBeInTheDocument();
    expect(screen.getByText("Use entered text")).toBeInTheDocument();
    expect(input).toHaveValue("mystery");
  });

  it("shows EU and ACD results together when both filters are enabled", async () => {
    vi.mocked(searchIngredients).mockResolvedValue({
      query: "hydro",
      dataset_version: "eu-glossary-2025-1175",
      accepted_baseline_sha256: "identity-hash",
      results: [{ ...result, canonical_name: "HYDROQUINONE", display_name: "Hydroquinone" }],
    });
    vi.mocked(searchACDIngredients).mockResolvedValue({
      query: "hydro",
      dataset_version: "acd-2026-1__sg-2025-12-01",
      accepted_baseline_sha256: "regulatory-hash",
      results: [acdResult],
    });
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "hydro");
    await screen.findByText("Recognised ingredient name");
    await user.click(screen.getByRole("checkbox", { name: "ACD regulatory lists" }));

    expect(await screen.findByText("ACD regulatory listing")).toBeInTheDocument();
    expect(screen.getByText("Annex III Part 1 · Ref 14")).toBeInTheDocument();
    expect(searchIngredients).toHaveBeenLastCalledWith("hydro", expect.any(AbortSignal), 10);
    expect(searchACDIngredients).toHaveBeenLastCalledWith("hydro", expect.any(AbortSignal), 10);
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("keeps current suggestions visible while a filter update is loading", async () => {
    vi.mocked(searchIngredients).mockResolvedValue({
      query: "hydro",
      dataset_version: "eu-glossary-2025-1175",
      accepted_baseline_sha256: "identity-hash",
      results: [{ ...result, canonical_name: "HYDROQUINONE", display_name: "Hydroquinone" }],
    });
    let resolveACD!: (value: Awaited<ReturnType<typeof searchACDIngredients>>) => void;
    vi.mocked(searchACDIngredients).mockImplementation(() => new Promise((resolve) => {
      resolveACD = resolve;
    }));

    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("combobox"), "hydro");
    expect(await screen.findByText("Recognised ingredient name")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "ACD regulatory lists" }));
    expect(screen.getByText("Updating results…")).toBeInTheDocument();
    expect(screen.getByText("Recognised ingredient name")).toBeInTheDocument();
    await waitFor(() => expect(searchACDIngredients).toHaveBeenCalled());

    await act(async () => {
      resolveACD({
        query: "hydro",
        dataset_version: "acd-2026-1__sg-2025-12-01",
        accepted_baseline_sha256: "regulatory-hash",
        results: [acdResult],
      });
    });
    expect(await screen.findByText("ACD regulatory listing")).toBeInTheDocument();
  });

  it("can search only ACD and selects the exact accepted source wording", async () => {
    vi.mocked(searchACDIngredients).mockResolvedValue({
      query: "hydro",
      dataset_version: "acd-2026-1__sg-2025-12-01",
      accepted_baseline_sha256: "regulatory-hash",
      results: [acdResult],
    });
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "hydro");
    await screen.findByText("No result found in the selected sources");
    await user.click(screen.getByRole("checkbox", { name: "EU glossary" }));
    await user.click(screen.getByRole("checkbox", { name: "ACD regulatory lists" }));
    await user.click(await screen.findByRole("option", { name: /Hydroquinone/ }));

    expect(input).toHaveValue("Hydroquinone");
    expect(searchIngredients).toHaveBeenCalledTimes(1);
    expect(searchACDIngredients).toHaveBeenLastCalledWith("hydro", expect.any(AbortSignal), 20);
  });

});
