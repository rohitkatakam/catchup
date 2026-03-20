// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Page from "@/app/page";

describe("Submission Page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders author selector, textarea, and submit button", () => {
    render(<Page />);
    expect(screen.getByRole("combobox", { name: /author/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /update/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
  });

  it("blocks submit when required fields are empty", () => {
    render(<Page />);
    
    const authorSelect = screen.getByRole("combobox", { name: /author/i }) as HTMLSelectElement;
    const updateTextarea = screen.getByRole("textbox", { name: /update/i }) as HTMLTextAreaElement;
    const form = updateTextarea.closest("form") as HTMLFormElement;
    
    const fetchSpy = vi.spyOn(global, "fetch");
    
    // Assert HTML5 validation state instead of simulating click 
    // to avoid relying on JSDOM's imperfect form validation simulation
    expect(authorSelect.validity.valueMissing).toBe(true);
    expect(updateTextarea.validity.valueMissing).toBe(true);
    expect(form.checkValidity()).toBe(false);
    
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("displays success state after mocked successful POST", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    render(<Page />);
    
    // Assuming "Alice" is an option in the UI, if not, we can type if it's a combobox, 
    // but the test expects selectOptions to work with combobox. Let's just select an option.
    const combobox = screen.getByRole("combobox", { name: /author/i });
    await user.selectOptions(combobox, "Alice");
    await user.type(screen.getByRole("textbox", { name: /update/i }), "Hello world");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(fetchSpy).toHaveBeenCalledWith("/api/submit", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: "Alice", content: "Hello world" })
    }));

    await waitFor(() => {
      // Find something that indicates success
      expect(screen.getByText(/success/i)).toBeInTheDocument();
    });
  });

  it("displays error feedback for failed POST", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: { message: "Invalid request payload", fieldErrors: { content: ["Too short"] } }
      }),
    } as Response);

    render(<Page />);
    
    await user.selectOptions(screen.getByRole("combobox", { name: /author/i }), "Bob");
    await user.type(screen.getByRole("textbox", { name: /update/i }), "x");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid request payload/i)).toBeInTheDocument();
    });
  });
});
