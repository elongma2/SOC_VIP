import { render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IngredientCombobox } from "./IngredientCombobox";
import { searchIngredients } from "../api/screening";

vi.mock("../api/screening", () => ({ searchIngredients: vi.fn() }));

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

function Harness() {
  const [value, setValue] = useState("");
  return <IngredientCombobox rowNumber={1} value={value} disabled={false} invalid={false} onChange={setValue} />;
}

describe("IngredientCombobox", () => {
  beforeEach(() => vi.mocked(searchIngredients).mockReset());

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
    expect(await screen.findByText("Ingredient not found in identity catalogue")).toBeInTheDocument();
    expect(screen.getByText("Use entered text")).toBeInTheDocument();
    expect(input).toHaveValue("mystery");
  });

});
