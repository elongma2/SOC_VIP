import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { baseResult, evidence } from "../test/fixtures";
import type { IngredientResult, LinkageEvidence } from "../types/screening";


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

function linkageEvidence(status: LinkageEvidence["accepted_status"]): LinkageEvidence {
  return {
    linkage_id: "eu-sg-link-eu-2025-1175-entry-17380-sg-2025-12-01",
    accepted_status: status,
    applicable_to_active_baseline: true,
    identity_dataset_version: "eu-glossary-2025-1175",
    identity_dataset_hash: "identityhash",
    singapore_regulatory_baseline: "sg-2025-12-01",
    singapore_regulatory_baseline_hash: "regulatoryhash",
    screened_scope: ["Third Schedule Part I", "Third Schedule Part II"],
    singapore_targets: [],
    review: {
      reviewed: true,
      reviewed_at: "2026-09-16",
      reviewer: "Test reviewer",
      review_basis: "Compared against the accepted scope.",
      notes: "Test evidence.",
    },
    inapplicability_reasons: [],
  };
}

function catalogueResult(status: "unresolved" | "linked" | "verified_not_represented"): IngredientResult {
  const result = baseResult(1, "Niacinamide");
  result.identity.identity_source_type = "ingredient_identity_catalogue";
  result.identity.identity_source_name = "EU Glossary of Common Ingredient Names";
  result.identity.catalogue_identity = catalogueIdentity;
  result.identity.singapore_linkage_status = status;
  result.identity.resolved_singapore_substance_id = null;
  result.identity.resolved_singapore_substance_ids = [];
  if (status === "unresolved") {
    result.identity.status = "review_required";
    result.identity.linkage_evidence = null;
    result.primary_finding = "professional_review_required";
    result.review_required = true;
    result.review_types = ["identity_review"];
    result.review_reasons = ["catalogue_identity_singapore_linkage_unresolved"];
    return result;
  }
  result.identity.linkage_evidence = linkageEvidence(status);
  if (status === "verified_not_represented") {
    result.scope_note = "No corresponding identity was professionally verified in the accepted scope. This does not establish general Singapore permission, safety, or product compliance.";
  }
  return result;
}

describe("linkage evidence presentation", () => {
  it("shows unresolved catalogue linkage as identity verification work", () => {
    render(<EvidenceDrawer result={catalogueResult("unresolved")} sources={[]} onClose={vi.fn()} />);
    expect(screen.getByText("Needs verification")).toBeInTheDocument();
    expect(screen.getByText(/recognised catalogue identity has not been verified/)).toBeInTheDocument();
    expect(screen.queryByText("Technical provenance")).not.toBeInTheDocument();
  });

  it("explains stale and unavailable linkage baselines without changing the finding", () => {
    const stale = catalogueResult("unresolved");
    stale.identity.linkage_evidence = linkageEvidence("linked");
    stale.identity.linkage_evidence.applicable_to_active_baseline = false;
    stale.identity.linkage_evidence.inapplicability_reasons = ["Singapore regulatory baseline hash changed"];
    stale.review_reasons = ["linkage_not_valid_for_active_baseline"];
    const { rerender } = render(
      <EvidenceDrawer result={stale} sources={[]} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/not valid for the active source baseline/)).toBeInTheDocument();
    expect(screen.getByText("Singapore regulatory baseline hash changed")).toBeInTheDocument();

    const unavailable = catalogueResult("unresolved");
    unavailable.review_reasons = ["ingredient_linkage_baseline_unavailable"];
    rerender(<EvidenceDrawer result={unavailable} sources={[]} onClose={vi.fn()} />);
    expect(screen.getByText("The accepted Singapore identity-linkage baseline is unavailable")).toBeInTheDocument();
  });

  it("shows scoped verified absence with bounded wording and collapsed provenance", async () => {
    const user = userEvent.setup();
    render(<EvidenceDrawer result={catalogueResult("verified_not_represented")} sources={[]} onClose={vi.fn()} />);
    expect(screen.getByText("Verified for current screening scope")).toBeInTheDocument();
    expect(screen.getByText("Third Schedule Part I · Third Schedule Part II")).toBeInTheDocument();
    expect(screen.getByText(/does not establish general Singapore permission/)).toBeInTheDocument();
    const technical = screen.getByText("Technical provenance").closest("details")!;
    expect(technical).not.toHaveAttribute("open");
    await user.click(within(technical).getByText("Technical provenance"));
    expect(within(technical).getByText("Test reviewer")).toBeInTheDocument();
    expect(within(technical).getByText("identityhash")).toBeInTheDocument();
  });

  it("keeps linked Singapore rule evidence primary", () => {
    const result = catalogueResult("linked");
    const ruleEvidence = evidence("I", "A1140", "Diethylene glycol conditional wording");
    result.submitted_ingredient.name = "Diethylene glycol";
    result.identity.catalogue_identity = {
      ...catalogueIdentity,
      ingredient_id: "eu-2025-1175-entry-08587",
      canonical_name: "DIETHYLENE GLYCOL",
    };
    result.identity.resolved_singapore_substance_ids = ["substance-sg-third-schedule-i-a1140"];
    result.primary_finding = "professional_review_required";
    result.review_required = true;
    result.review_types = ["rule_review"];
    result.review_reasons = ["sg-third-schedule-i-a1140: conditional_prohibition_wording_not_structured"];
    result.rule_evaluations = [{
      rule_id: "sg-third-schedule-i-a1140",
      evaluation_status: "withheld_professional_review",
      finding: null,
      reasons: ["conditional_prohibition_wording_not_structured"],
      submitted_concentration: null,
      evidence: ruleEvidence,
    }];
    result.identity.linkage_evidence!.singapore_targets = [{
      raw_record_id: ruleEvidence.raw_record_id,
      rule_id: "sg-third-schedule-i-a1140",
      substance_id: "substance-sg-third-schedule-i-a1140",
      part: "Third Schedule Part I",
      reference: "A1140",
      source_substance_name: ruleEvidence.substance_name,
      source_document: ruleEvidence.source_document,
      source_hash: "sourcehash",
    }];
    render(<EvidenceDrawer result={result} sources={[]} onClose={vi.fn()} />);
    expect(screen.getByText("Linked to Singapore regulatory identity")).toBeInTheDocument();
    expect(screen.getByText("Regulatory basis")).toBeInTheDocument();
    expect(screen.getByText("Reference A1140 · Regulation 6(1)")).toBeInTheDocument();
    expect(screen.getByText("Accepted snapshot evidence")).toBeInTheDocument();
  });
});
