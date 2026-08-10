import { describe, expect, it } from "vitest";

import {
  TEMPLATE_VARIABLE_NAMES,
  buildTemplateVariables,
  renderBody,
  renderSubject,
  renderTemplate,
  textToHtml,
} from "./templates";

const base = {
  clientName: "Dana",
  clientCompany: "Northwind",
  invoiceNumber: "INV-0004",
  amount: 1200,
  currency: "USD",
  dueDate: "2026-08-10",
  businessName: "Acme Design",
  senderName: "Jane",
};

describe("buildTemplateVariables — payment_instructions", () => {
  it("passes the instructions through", () => {
    const vars = buildTemplateVariables({ ...base, paymentInstructions: "IBAN GB12 3456" });
    expect(vars.payment_instructions).toBe("IBAN GB12 3456");
  });

  it("renders empty when unset, so the block collapses instead of leaving a label", () => {
    expect(buildTemplateVariables(base).payment_instructions).toBe("");
    expect(
      buildTemplateVariables({ ...base, paymentInstructions: null }).payment_instructions,
    ).toBe("");
    expect(
      buildTemplateVariables({ ...base, paymentInstructions: "   " }).payment_instructions,
    ).toBe("");
  });

  it("is exposed to the template editor UI", () => {
    expect(TEMPLATE_VARIABLE_NAMES).toContain("payment_instructions");
  });
});

describe("renderBody", () => {
  const vars = buildTemplateVariables({ ...base, paymentInstructions: "How to pay:\nIBAN GB12" });

  it("substitutes the instructions", () => {
    expect(renderBody("Hi {{client_name}},\n\n{{payment_instructions}}", vars)).toBe(
      "Hi Dana,\n\nHow to pay:\nIBAN GB12",
    );
  });

  it("collapses the gap left by an empty variable", () => {
    // This is the seeded system-template shape: the tag sits on its own paragraph.
    const empty = buildTemplateVariables(base);
    expect(renderBody("Thanks,\nJane\n\n{{payment_instructions}}", empty)).toBe("Thanks,\nJane");
    expect(renderBody("A\n\n{{payment_instructions}}\n\nB", empty)).toBe("A\n\nB");
  });

  it("leaves ordinary paragraph breaks alone", () => {
    expect(renderBody("A\n\nB\nC", vars)).toBe("A\n\nB\nC");
  });

  it("strips trailing whitespace on lines", () => {
    expect(renderBody("A   \nB", vars)).toBe("A\nB");
  });

  it("leaves unknown tags untouched rather than blanking them", () => {
    expect(renderBody("{{not_a_variable}}", vars)).toBe("{{not_a_variable}}");
  });

  it("does not expand tags that appear inside a variable's value", () => {
    const nested = buildTemplateVariables({
      ...base,
      paymentInstructions: "Ref {{invoice_number}}",
    });
    expect(renderBody("{{payment_instructions}}", nested)).toBe("Ref {{invoice_number}}");
  });
});

describe("renderSubject", () => {
  const vars = buildTemplateVariables({
    ...base,
    paymentInstructions: "How to pay:\nIBAN GB12\nRef 4",
  });

  it("flattens a multi-line variable to a single line", () => {
    // A newline in a subject would break the header.
    const subject = renderSubject("Invoice {{payment_instructions}}", vars);
    expect(subject).not.toContain("\n");
    expect(subject).toBe("Invoice How to pay: IBAN GB12 Ref 4");
  });

  it("renders a normal subject unchanged", () => {
    expect(renderSubject("Invoice {{invoice_number}} is due", vars)).toBe(
      "Invoice INV-0004 is due",
    );
  });

  it("truncates an overlong subject", () => {
    const long = buildTemplateVariables({ ...base, paymentInstructions: "x".repeat(500) });
    const subject = renderSubject("{{payment_instructions}}", long);
    expect(subject.length).toBeLessThanOrEqual(200);
    expect(subject.endsWith("…")).toBe(true);
  });
});

describe("renderTemplate still honours existing behaviour", () => {
  const vars = buildTemplateVariables({ ...base, paymentInstructions: "PAY" });

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("{{ payment_instructions }}", vars)).toBe("PAY");
  });

  it("does NOT resolve a differently-cased tag", () => {
    // The regex carries an `i` flag, so an uppercase tag matches — but the captured
    // key is then looked up case-sensitively and misses, leaving the tag literal.
    // Documenting it because the `i` flag reads as though case were handled.
    expect(renderTemplate("{{Payment_Instructions}}", vars)).toBe("{{Payment_Instructions}}");
  });
});

describe("textToHtml", () => {
  it("escapes markup in payment instructions", () => {
    expect(textToHtml("<b>IBAN</b> & co")).toContain("&lt;b&gt;IBAN&lt;/b&gt; &amp; co");
  });
});
