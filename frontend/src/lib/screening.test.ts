import { describe, expect, it } from "vitest";
import { supportingSingaporeEvaluations } from "./screening";
import { baseResult, evidence } from "../test/fixtures";

describe("Singapore table rule selection", () => {
  it("selects the Singapore evaluation supporting the displayed primary finding", () => {
    const result = baseResult(1, "Example");
    result.primary_finding = "restriction_exceeded";
    result.confirmed_findings = ["restriction_exceeded"];
    result.rule_evaluations = [
      {
        rule_id: "unrelated",
        evaluation_status: "deterministic",
        finding: "restriction_within_limit",
        reasons: [], submitted_concentration: null,
        evidence: evidence("II", "4", "Example"),
      },
      {
        rule_id: "supporting",
        evaluation_status: "deterministic",
        finding: "restriction_exceeded",
        reasons: [], submitted_concentration: null,
        evidence: evidence("II", "5", "Example"),
      },
    ];
    expect(supportingSingaporeEvaluations(result).map((item) => item.rule_id)).toEqual(["supporting"]);
  });

  it("does not use ACD identity-only or withheld evaluations as Singapore table rules", () => {
    const result = baseResult(1, "Example");
    result.primary_finding = "professional_review_required";
    result.review_required = true;
    const withheld = evidence("II", "5", "Example");
    const acdOnly = evidence("II", "342", "BHT");
    acdOnly.regulatory_section = "Annex III Part 1";
    result.rule_evaluations = [
      {
        rule_id: "acd-only",
        evaluation_status: "identity_evidence",
        finding: "professional_review_required",
        reasons: ["acd_only"],
        submitted_concentration: null,
        evidence: acdOnly,
      },
      {
        rule_id: "withheld",
        evaluation_status: "withheld",
        finding: null,
        reasons: ["manual_review_required"],
        submitted_concentration: null,
        evidence: withheld,
      },
    ];
    expect(supportingSingaporeEvaluations(result)).toEqual([]);
  });
});
