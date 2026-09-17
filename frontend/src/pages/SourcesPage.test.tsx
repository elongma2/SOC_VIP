import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourcesPage } from "./SourcesPage";

const searchResponse = {
  query: "hydro",
  dataset_version: "acd-2026-1__sg-2025-12-01",
  accepted_baseline_sha256: "baseline-hash",
  results: [{
    rule_id: "acd-annex-iii-2",
    substance_id: "substance-acd-annex-iii-2",
    name: "Hydroquinone",
    annex: "Annex III Part 1",
    reference: "2",
    cas_numbers: ["123-31-9"],
    restriction_type: "restricted",
    product_context: "Artificial nail systems",
    concentration: null,
    concentration_text: "0.02% after mixing for use",
    other_conditions: "For professional use only",
    required_warning: "Avoid skin contact",
    source_text: "2 | Hydroquinone | Artificial nail systems | 0.02% after mixing for use",
    source_pages: [103],
    raw_record_id: "raw-acd-annex-iii-2",
    source_version: "2026-1, 22 June 2026",
    source_url: "https://file.go.gov.sg/annexes.pdf",
    normalization_status: "manual_review_required",
    review_reasons: ["source condition requires review"],
    manual_review_required: true,
  }],
};

afterEach(() => vi.restoreAllMocks());

describe("ACD regulatory Sources page", () => {
  it("searches accepted ACD records and shows exact evidence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => searchResponse } as Response);
    const user = userEvent.setup();
    render(<SourcesPage />);
    await user.type(screen.getByLabelText("Search ACD regulatory ingredients"), "hydro");
    const result = await screen.findByRole("button", { name: /Hydroquinone/ });
    await user.click(result);
    const detail = screen.getByLabelText("Selected ACD regulatory record");
    expect(within(detail).getByText("Annex III Part 1 · Ref 2")).toBeInTheDocument();
    expect(within(detail).getByText("123-31-9")).toBeInTheDocument();
    expect(within(detail).getByText("Artificial nail systems")).toBeInTheDocument();
    expect(within(detail).getByText("For professional use only")).toBeInTheDocument();
    expect(within(detail).getByText("Avoid skin contact")).toBeInTheDocument();
    expect(within(detail).getByRole("img")).toHaveAttribute("src", "/api/source-evidence/raw-acd-annex-iii-2");
    expect(within(detail).getByRole("link", { name: /Open official ACD source/ })).toHaveAttribute("href", "https://file.go.gov.sg/annexes.pdf");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/acd-ingredients?query=hydro&limit=20");
  });

  it("opens and closes the trusted full accepted ACD page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => searchResponse } as Response);
    const user = userEvent.setup();
    render(<SourcesPage />);
    await user.type(screen.getByLabelText("Search ACD regulatory ingredients"), "hydro");
    await user.click(await screen.findByRole("button", { name: /Hydroquinone/ }));

    await user.click(screen.getByRole("button", { name: "View full accepted page" }));
    const modal = screen.getByRole("dialog", { name: "Accepted ACD source page" });
    expect(within(modal).getByRole("img")).toHaveAttribute("src", "/api/source-evidence/raw-acd-annex-iii-2/page");
    expect(within(modal).getByText("Annex III Part 1 · Ref 2 · Page 103")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Accepted ACD source page" })).not.toBeInTheDocument();
  });

  it("renders empty and error states without inventing status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...searchResponse, results: [] }) } as Response);
    const user = userEvent.setup();
    const { unmount } = render(<SourcesPage />);
    await user.type(screen.getByLabelText("Search ACD regulatory ingredients"), "zz");
    expect(await screen.findByText("No matching ACD record was found in the scoped lists.")).toBeInTheDocument();
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/allowed in singapore|approved ingredient/);
    unmount();

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error("Search unavailable"));
    render(<SourcesPage />);
    await user.type(screen.getByLabelText("Search ACD regulatory ingredients"), "hydro");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to reach the screening service.");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
