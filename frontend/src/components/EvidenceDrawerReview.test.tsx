import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { baseResult, evidence } from "../test/fixtures";

function reviewResult(source: "model" | "deterministic_fallback" = "model") {
  const result = baseResult(1, "Tosylchloramide sodium");
  result.primary_finding = "professional_review_required";
  result.review_required = true;
  result.review_types = ["rule_review"];
  result.review_reasons = ["incompatible_preparation_stage"];
  result.review_explanation = {
    title: "Preparation stage needs review",
    summary: "The submitted concentration and rule refer to different preparation stages, so they cannot be compared directly.",
    what_to_check: "Confirm the concentration at the preparation stage specified by the rule.",
    submitted_fact: "2% · Finished product",
    regulatory_fact: "Maximum 2% · After mixing for use",
    source,
  };
  const rule = evidence("II", "5", "Tosylchloramide sodium");
  result.rule_evaluations = [{
    rule_id: rule.rule_id,
    evaluation_status: "manual_review_required",
    finding: "professional_review_required",
    reasons: ["incompatible_preparation_stage"],
    submitted_concentration: { value: 2, unit: "percent", basis: null, preparation_stage: "finished_product" },
    evidence: rule,
  }];
  return result;
}

describe("review guidance", () => {
  it("shows plain guidance and keeps machine codes collapsed", async () => {
    const user = userEvent.setup();
    render(<EvidenceDrawer
      result={reviewResult()}
      sources={[]}
      explanationMetadata={{
        configured: true,
        configured_model: "gpt-5.6-luna",
        actual_model: "gpt-5.6-luna-verified",
        status: "model",
        requested_count: 1,
        model_count: 1,
        fallback_count: 0,
        truncated_count: 0,
        usage: null,
      }}
      onClose={vi.fn()}
    />);
    expect(screen.getByText("Preparation stage needs review")).toBeInTheDocument();
    expect(screen.getByText("2% · Finished product")).toBeInTheDocument();
    expect(screen.getByText("Maximum 2% · After mixing for use")).toBeInTheDocument();
    const technical = screen.getByText("Technical provenance").closest("details");
    expect(technical).not.toHaveAttribute("open");
    await user.click(screen.getByText("Technical provenance"));
    expect(technical).toHaveAttribute("open");
    expect(screen.getByText("incompatible_preparation_stage")).toBeInTheDocument();
    expect(screen.getByText("gpt-5.6-luna-verified")).toBeInTheDocument();
  });

  it("labels deterministic fallback without weakening the review", async () => {
    const user = userEvent.setup();
    render(<EvidenceDrawer result={reviewResult("deterministic_fallback")} sources={[]} onClose={vi.fn()} />);
    expect(screen.getByText("Preparation stage needs review")).toBeInTheDocument();
    await user.click(screen.getByText("Technical provenance"));
    expect(screen.getByText("Deterministic fallback")).toBeInTheDocument();
  });
});
