import { describe, expect, it } from "vitest";
import { renderFilename, sanitizeFilename } from "../src/template/filename.js";

describe("renderFilename", () => {
  it("substitutes tags and appends the extension", () => {
    const name = renderFilename("Contract - {Customer_Name} - {Date}", { Customer_Name: "Acme", Date: "18/08/2026" }, "docx");
    expect(name).toBe("Contract - Acme - 18_08_2026.docx");
  });

  it("does not double up an extension already present in the pattern", () => {
    const name = renderFilename("Invoice_{Invoice_Number}.docx", { Invoice_Number: "INV-01" }, "docx");
    expect(name).toBe("Invoice_INV-01.docx");
  });

  it("joins array values with '+' and objects with '_'", () => {
    const name = renderFilename("{Tags}", { Tags: ["a", "b"] }, "docx");
    expect(name).toBe("a+b.docx");
  });

  it("leaves unknown tags blank", () => {
    const name = renderFilename("{Unknown}-report", {}, "pdf");
    expect(name).toBe("-report.pdf");
  });
});

describe("sanitizeFilename", () => {
  it("strips filesystem-illegal characters", () => {
    expect(sanitizeFilename('a/b:c*d?e"f<g>h|i')).toBe("a_b_c_d_e_f_g_h_i");
  });

  it("falls back to 'document' for an empty result", () => {
    expect(sanitizeFilename("   ")).toBe("document");
  });

  it("truncates very long names", () => {
    const long = "x".repeat(300);
    expect(sanitizeFilename(long).length).toBe(150);
  });
});
