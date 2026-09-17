import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { baseResult, testResponse } from "../test/fixtures";
import type { ScreeningResponse } from "../types/screening";
import { ScreeningSummary } from "./ScreeningSummary";

function responseCopy(): ScreeningResponse {
  return structuredClone(testResponse);
}

describe("ScreeningSummary", () => {
  it("counts each attention row once and separates review status from primary findings", () => {
    const response = responseCopy();
    render(
      <ScreeningSummary
        summary={response.summary}
        results={response.ingredient_results}
        selectedRow={1}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText("3 of 3 ingredients require attention")).toBeInTheDocument();
    expect(screen.getByText("2 deterministic regulatory findings · 1 unresolved identity")).toBeInTheDocument();

    const reviewCard = screen.getByText("Needs human review").closest<HTMLElement>(".summary-card")!;
    expect(within(reviewCard).getByText("0")).toBeInTheDocument();
    const unresolvedCard = screen.getByText("Identity unresolved").closest<HTMLElement>(".summary-card")!;
    expect(within(unresolvedCard).getByText("1")).toBeInTheDocument();

    const humanReview = screen.getByRole("heading", { name: "Human review" }).closest("section")!;
    expect(within(humanReview).getByText("1 ingredient requires human review")).toBeInTheDocument();
    expect(within(humanReview).getAllByText("Mystery Extract")).toHaveLength(1);
  });

  it("lists only attention rows and selects the requested evidence row", async () => {
    const response = responseCopy();
    const withinLimit = baseResult(4, "Within limit ingredient");
    withinLimit.primary_finding = "restriction_within_limit";
    withinLimit.confirmed_findings = ["restriction_within_limit"];
    const noIssue = baseResult(5, "No issue ingredient");
    response.ingredient_results.push(withinLimit, noIssue);
    response.summary.ingredients_submitted = 5;
    response.summary.restriction_within_limit = 1;
    response.summary.no_issue_identified_within_scoped_rules = 1;
    const onSelect = vi.fn();

    render(
      <ScreeningSummary
        summary={response.summary}
        results={response.ingredient_results}
        selectedRow={null}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("3 of 5 ingredients require attention")).toBeInTheDocument();
    const attention = screen.getByRole("heading", { name: "What needs attention" }).closest("section")!;
    expect(within(attention).queryByText("Within limit ingredient")).not.toBeInTheDocument();
    expect(within(attention).queryByText("No issue ingredient")).not.toBeInTheDocument();
    await userEvent.click(within(attention).getByRole("button", { name: /Tosylchloramide sodium/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("uses response summary counts and renders the quiet no-review state", () => {
    const result = baseResult(1, "No issue ingredient");
    const summary = {
      ...responseCopy().summary,
      ingredients_submitted: 1,
      prohibited_substance_identified: 0,
      restriction_exceeded: 0,
      restriction_within_limit: 0,
      professional_review_required: 0,
      information_missing: 0,
      identity_unresolved: 0,
      no_issue_identified_within_scoped_rules: 1,
      total_requiring_review: 0,
      total_unresolved_identities: 0,
    };

    render(<ScreeningSummary summary={summary} results={[result]} selectedRow={null} onSelect={() => undefined} />);
    expect(screen.getByText("0 of 1 ingredient requires attention")).toBeInTheDocument();
    expect(screen.getByText("No ingredients currently require manual review.")).toBeInTheDocument();
    expect(screen.getByLabelText("Secondary finding counts")).toHaveTextContent("1 no scoped issue");
  });

  it("uses returned reasons to explain missing information", () => {
    const result = baseResult(1, "Restricted ingredient");
    result.primary_finding = "information_missing";
    result.rule_evaluations = [{
      rule_id: "sg-example",
      evaluation_status: "withheld_information_missing",
      finding: null,
      reasons: ["sg-example: product context is required"],
      submitted_concentration: null,
      evidence: {
        dataset_version: result.dataset_version,
        rule_id: "sg-example",
        source_document: "singapore_regulations_2025_12_01",
        source_version: "version in force from 1 December 2025",
        effective_date: "2025-12-01",
        document_revision: "version in force from 1 December 2025",
        retrieval_date: "2026-09-15",
        source_url: "https://sso.agc.gov.sg/example",
        regulatory_section: "Third Schedule Part II",
        reference_number: "6",
        substance_name: "Restricted ingredient",
        product_context: "Toothpaste",
        concentration: null,
        other_conditions: null,
        required_warning: null,
        source_text: "source wording",
        source_pages: [99],
        normalization_status: "normalized",
        review_reasons: [],
        raw_record_id: "raw-example",
        raw_fragments: [],
        regulation_6_provisions: [],
        cross_references: [],
        acd_counterpart_rules: [],
      },
    }];
    const summary = {
      ...responseCopy().summary,
      ingredients_submitted: 1,
      prohibited_substance_identified: 0,
      restriction_exceeded: 0,
      professional_review_required: 0,
      information_missing: 1,
      identity_unresolved: 0,
      total_requiring_review: 0,
      total_unresolved_identities: 0,
    };

    render(<ScreeningSummary summary={summary} results={[result]} selectedRow={null} onSelect={() => undefined} />);
    const attention = screen.getByRole("heading", { name: "What needs attention" }).closest("section")!;
    expect(within(attention).getByText("Information missing · Product context is required")).toBeInTheDocument();
  });
});
