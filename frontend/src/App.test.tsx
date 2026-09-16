import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { optionsFixture, testResponse } from "./test/fixtures";

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
}

function mockSuccessfulApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    return url.endsWith("/screening-options")
      ? jsonResponse(optionsFixture)
      : jsonResponse(testResponse);
  });
}

describe("formula screening vertical slice", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("screens TEST-001 and renders row-based results from the API", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));

    expect(await screen.findByText("3 ingredients require attention")).toBeInTheDocument();
    expect(screen.getAllByText("Prohibited-list substance identified").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/A1136/).length).toBeGreaterThan(0);
    const aminoRow = screen.getAllByText("Aminophylline").find((element) => element.closest("tr"))!.closest("tr")!;
    expect(within(aminoRow).getByText("—")).toBeInTheDocument();
    expect(within(aminoRow).getByText(/Regulation 6\(1\)/)).toBeInTheDocument();

    const reviewCard = screen.getAllByText("Review required")
      .find((element) => element.closest(".summary-card"))!.closest("div")!;
    expect(within(reviewCard).getByText("1")).toBeInTheDocument();
    expect(screen.getByText((_, element) =>
      element?.tagName === "SPAN" && element.textContent === "0 professional review finding",
    )).toBeInTheDocument();
  });

  it("labels an ACD counterpart CAS separately from the submitted CAS", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    await user.click(await screen.findByText("Tosylchloramide sodium"));

    const drawer = screen.getByLabelText("Regulatory evidence");
    expect(within(drawer).getByText("Submitted CAS")).toBeInTheDocument();
    expect(within(drawer).getByText("Source-backed identifier")).toBeInTheDocument();
    expect(within(drawer).getByText("CAS 127-65-1 · Annex III")).toBeInTheDocument();
    expect(within(drawer).getByText("Accepted snapshot · version in force 1 Dec 2025")).toBeInTheDocument();
    const crop = within(drawer).getByRole("img", { name: /Accepted PDF row.*reference 5/ });
    expect(crop).toHaveAttribute("src", "/api/source-evidence/raw-sg-5");
    expect(crop.getAttribute("src")).not.toMatch(/bbox|page=|source=/);
    expect(within(drawer).getByRole("link", { name: /Open official source/ })).toHaveAttribute(
      "href", "https://sso.agc.gov.sg/SL/HPA2007-S683-2007",
    );
  });

  it("renders readable ACD comparisons and keeps raw differences in collapsed provenance", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    await user.click(await screen.findByText("Tosylchloramide sodium"));
    const drawer = screen.getByLabelText("Regulatory evidence");
    const acdDetails = within(drawer).getByText("ACD comparison").closest("details")!;
    await user.click(within(acdDetails).getByText("ACD comparison"));
    expect(within(acdDetails).getByText("Product context")).toBeInTheDocument();
    expect(within(acdDetails).getByText("Ready for use")).toBeInTheDocument();
    expect(within(acdDetails).getByText("Finished product")).toBeInTheDocument();
    expect(within(acdDetails).getByText("ACD and Singapore source wording or regulatory fields differ")).toBeInTheDocument();
    const technical = within(drawer).getByText("Technical provenance").closest("details")!;
    expect(technical).not.toHaveAttribute("open");
    expect(within(technical).getByText(/\[parent\]/)).not.toBeVisible();
  });

  it("shows plain-language field help and readable enum labels", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByLabelText("About Product context"));
    expect(screen.getByText(/same ingredient may have different restrictions/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("About Preparation stage"));
    expect(screen.getByText(/does not convert a packaged-product concentration/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("About Concentration basis"));
    expect(screen.getByText(/No specific basis means the request sends JSON null/)).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "No specific basis" })).toHaveLength(3);
    expect(screen.getAllByRole("option", { name: "Finished product" }).length).toBeGreaterThan(0);
  });

  it("opens the full accepted page from the trusted raw-record route", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    await user.click(await screen.findByText("Tosylchloramide sodium"));
    await user.click(screen.getByRole("button", { name: "View full accepted page" }));
    const modal = screen.getByRole("dialog", { name: "Accepted source page" });
    expect(within(modal).getByRole("img")).toHaveAttribute("src", "/api/source-evidence/raw-sg-5/page");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Accepted source page" })).not.toBeInTheDocument();
  });

  it("keeps textual evidence available when the crop cannot load", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    await user.click(await screen.findByText("Tosylchloramide sodium"));
    fireEvent.error(screen.getByRole("img", { name: /Accepted PDF row.*reference 5/ }));
    expect(screen.getByText(/accepted source row could not be rendered/i)).toBeInTheDocument();
    expect(screen.getByText("5 | Tosylchloramide sodium | All products | 0.2% | |")).toBeInTheDocument();
  });

  it("does not introduce a product-level regulatory conclusion", async () => {
    mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    const visibleText = document.body.textContent?.toLowerCase() ?? "";
    expect(visibleText).not.toMatch(/\b(compliant|approved|legal|safe|pass|fail)\b/);
  });

  it("sends null while concentration is disabled and exposes defaults when enabled", async () => {
    const fetchMock = mockSuccessfulApi();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());

    const toggle = screen.getByLabelText("Enable concentration for ingredient 1");
    await user.click(toggle);
    expect(screen.getByLabelText("Ingredient 1 concentration unit")).toHaveValue("percent");
    expect(screen.getByLabelText("Ingredient 1 concentration basis")).toHaveValue("");
    expect(screen.getByLabelText("Ingredient 1 preparation stage")).toHaveValue("finished_product");
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    await screen.findByText("3 ingredients require attention");
    const post = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/screen-formulation"))!;
    const sent = JSON.parse(String((post[1] as RequestInit).body));
    expect(sent.ingredients[0].concentration).toBeNull();
  });

  it("prevents double submission and displays the loading state", async () => {
    let resolvePost!: (value: Response) => void;
    const postPromise = new Promise<Response>((resolve) => { resolvePost = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      String(input).endsWith("/screening-options") ? jsonResponse(optionsFixture) : postPromise,
    );
    const user = userEvent.setup();
    render(<App />);
    const button = await screen.findByRole("button", { name: "Run screen" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(screen.getByRole("button", { name: "Screening…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Screening…" }));
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/screen-formulation"))).toHaveLength(1);
    resolvePost({ ok: true, status: 200, json: async () => testResponse } as Response);
    await screen.findByText("3 ingredients require attention");
  });

  it("shows FastAPI validation errors without treating them as findings", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      String(input).endsWith("/screening-options")
        ? jsonResponse(optionsFixture)
        : jsonResponse({ detail: [{ loc: ["body", "ingredients", 0, "cas_number"], msg: "CAS number must have valid syntax and checksum" }] }, 422),
    );
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run screen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run screen" }));
    expect(await screen.findByText("CAS number must have valid syntax and checksum")).toBeInTheDocument();
    expect(screen.queryByText(/ingredients require attention/)).not.toBeInTheDocument();
  });

  it("fails closed when screening options report a baseline integrity failure", async () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(jsonResponse({ detail: { code: "accepted_baseline_integrity_failure", message: "hash mismatch" } }, 503));
    render(<App />);
    expect(await screen.findByText("Regulatory dataset integrity verification failed. Screening is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run screen" })).toBeDisabled();
  });
});
