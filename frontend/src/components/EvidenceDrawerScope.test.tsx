import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { baseResult } from "../test/fixtures";

const catalogueIdentity = {
  ingredient_id: "eu-2025-1175-entry-17380",
  canonical_name: "NIACINAMIDE",
  source_name: "EU Glossary of Common Ingredient Names",
  source_document: "eu_common_ingredient_glossary_2025_1175",
  source_version: "Commission Implementing Decision (EU) 2025/1175",
  source_url: "http://data.europa.eu/eli/dec_impl/2025/1175/oj",
  source_entries: [17380],
  source_pages: [516],
  raw_record_ids: ["raw-eu-2025-1175-entry-17380"],
  identity_dataset_version: "eu-glossary-2025-1175",
  accepted_baseline_sha256: "identityhash",
};

function catalogueNoMatchResult() {
  const result = baseResult(1, "NIACINAMIDE");
  result.identity.identity_source_type = "ingredient_identity_catalogue";
  result.identity.identity_source_name = "EU Glossary of Common Ingredient Names";
  result.identity.catalogue_identity = catalogueIdentity;
  result.identity.singapore_linkage_status = "not_applicable";
  result.identity.resolved_singapore_substance_id = null;
  result.identity.resolved_singapore_substance_ids = [];
  result.primary_finding = "no_issue_identified_within_scoped_rules";
  result.review_required = false;
  result.review_types = [];
  result.review_reasons = [];
  result.rule_evaluations = [];
  result.scope_note = "The ingredient name is recognised in the EU Glossary of Common Ingredient Names. No matching entry was identified within Singapore Third Schedule Parts I/II or ACD Annex II/III currently covered by this screening engine. This does not establish ingredient safety, unrestricted use, or overall product compliance.";
  return result;
}

describe("catalogue identity regulatory-scope presentation", () => {
  it("shows recognised identity, all searched sections, and no Singapore rule", () => {
    render(<EvidenceDrawer result={catalogueNoMatchResult()} sources={[]} onClose={vi.fn()} />);
    const drawer = screen.getByLabelText("Regulatory evidence");
    expect(within(drawer).getAllByText("NIACINAMIDE").length).toBeGreaterThan(0);
    expect(within(drawer).getByText("EU Glossary of Common Ingredient Names")).toBeInTheDocument();
    expect(within(drawer).getByText("Third Schedule Part I searched")).toBeInTheDocument();
    expect(within(drawer).getByText("Third Schedule Part II searched")).toBeInTheDocument();
    expect(within(drawer).getByText("Annex II Part 1 searched")).toBeInTheDocument();
    expect(within(drawer).getByText("Annex III Part 1 searched")).toBeInTheDocument();
    expect(within(drawer).getByText("No scoped regulatory listing identified")).toBeInTheDocument();
    expect(within(drawer).getByText("No Singapore rule evaluated.")).toBeInTheDocument();
  });

  it("does not render the retired linkage gate or linkage-review wording", () => {
    render(<EvidenceDrawer result={catalogueNoMatchResult()} sources={[]} onClose={vi.fn()} />);
    const drawer = screen.getByLabelText("Regulatory evidence");
    expect(within(drawer).queryByText("Singapore linkage")).not.toBeInTheDocument();
    expect(within(drawer).queryByText("Needs verification")).not.toBeInTheDocument();
    expect(within(drawer).queryByText(/linkage needs verification/i)).not.toBeInTheDocument();
  });
});
