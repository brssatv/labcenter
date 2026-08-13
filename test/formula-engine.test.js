const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateFormulaExpression,
  parseFormulaExpression,
} = require("../assets/formula-engine.js");

function createFormulaContext() {
  const genes = [
    { key: "e-gene", label: "E Gene", ct: 31.2, result: "Detected" },
    { key: "n-gene", label: "N Gene", ct: 32.8, result: "Detected" },
    { key: "orf1ab", label: "Orf1ab", ct: 35.6, result: "Not Detected" },
  ];
  const organisms = [
    { key: "sars-cov-2", label: "SARS-CoV-2", detected: true, result: "Detected" },
    { key: "influenza-a", label: "Influenza A", detected: false, result: "Not Detected" },
  ];
  const pathogens = [
    { key: "sars-cov-2", label: "SARS-CoV-2", ct: 31.2, result: "Detected" },
    { key: "influenza-a", label: "Influenza A", ct: null, result: "Not Detected" },
  ];

  const resolveBySelector = (items, selectorValue, selectedValue) => {
    const normalized = String(selectorValue || "").trim().toLowerCase();
    if (!normalized || normalized.startsWith("selected")) {
      return items.find((item) => item.label === selectedValue) || items[0];
    }
    return items.find((item) => item.label.toLowerCase() === normalized || item.key.toLowerCase() === normalized) || items[0];
  };

  const state = {
    selected_gene: "E Gene",
    selected_organism: "SARS-CoV-2",
    selected_pathogen: "SARS-CoV-2",
    status: null,
    value: "",
  };

  return {
    variables: {
      selected_gene: state.selected_gene,
      selected_organism: state.selected_organism,
      selected_pathogen: state.selected_pathogen,
      formula_status: state.status,
      formula_value: state.value,
    },
    functions: {
      "@Gene": (selectorValue) => ({ ...resolveBySelector(genes, selectorValue, state.selected_gene) }),
      "@Organism": (selectorValue) => ({ ...resolveBySelector(organisms, selectorValue, state.selected_organism) }),
      "@Pathogen": (selectorValue) => ({ ...resolveBySelector(pathogens, selectorValue, state.selected_pathogen) }),
      "@Formula": () => ({ ...state }),
    },
  };
}

test("formula engine evaluates the starter SARS-CoV-2 rule without runtime code execution", () => {
  const result = evaluateFormulaExpression(
    [
      "IF(",
      "  COUNT(",
      '    @Gene("E Gene").ct <= 33,',
      '    @Gene("N Gene").ct <= 33,',
      '    @Gene("Orf1ab").ct <= 33',
      "  ) >= 2,",
      '  "Positive",',
      '  "Negative"',
      ")",
    ].join("\n"),
    createFormulaContext()
  );

  assert.equal(result, "Positive");
});

test("formula engine supports selected variables, macros, and case-insensitive property access", () => {
  const result = evaluateFormulaExpression(
    'IF(@Gene(selected_gene).Ct <= 33 AND @Organism(selected_organism).DETECTED, "Ready", "Hold")',
    createFormulaContext()
  );

  assert.equal(result, "Ready");
});

test("formula engine exposes formula metadata via @Formula()", () => {
  const result = evaluateFormulaExpression(
    'IF(@Formula().status = NULL AND @Pathogen(selected_pathogen).result = "Detected", "Draft", "Live")',
    createFormulaContext()
  );

  assert.equal(result, "Draft");
});

test("formula engine supports ISNULL for nullable report values", () => {
  const result = evaluateFormulaExpression(
    'IF(ISNULL(@Pathogen("Influenza A").ct), "Missing", "Present")',
    createFormulaContext()
  );

  assert.equal(result, "Missing");
});

test("formula engine parses nested function expressions", () => {
  const ast = parseFormulaExpression('ROUND(COUNT(TRUE, FALSE, TRUE) / 2, 1)');

  assert.equal(ast.type, "call");
  assert.equal(ast.callee.name, "ROUND");
});

test("formula engine averages numeric non-null values", () => {
  const result = evaluateFormulaExpression("ROUND(AVG(27, 20, null), 1)");

  assert.equal(result, 23.5);
});

test("formula engine rejects unsupported syntax with a parser error", () => {
  assert.throws(
    () => evaluateFormulaExpression('IF(@Gene("E Gene").ct <= 33; "Positive"; "Negative")', createFormulaContext()),
    /Unexpected token ";"|Expected "\)"/
  );
});
