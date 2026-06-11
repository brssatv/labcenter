const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDefaultFormulaPlaygroundData,
  stringifyFormulaPlaygroundData,
  createDefaultFormulaPlaygroundDraft,
  writeFormulaPlaygroundDraft,
  readFormulaPlaygroundDraft,
  resetFormulaPlaygroundDraft,
  buildFormulaPlaygroundPreview,
} = require("../assets/formula-playground.js");

test.afterEach(() => {
  resetFormulaPlaygroundDraft();
});

test("formula playground default preview evaluates the starter SARS-CoV-2 expression", () => {
  const preview = buildFormulaPlaygroundPreview(createDefaultFormulaPlaygroundDraft());

  assert.equal(preview.formulaResult.status, "Positive");
  assert.equal(preview.selectedGene.label, "E Gene");
  assert.equal(preview.selectedOrganism.label, "SARS-CoV-2");
  assert.equal(preview.selectedPathogen.label, "SARS-CoV-2");
  assert.equal(preview.outputObject.evaluated_result, "Positive");
  assert.ok(preview.outputObject.output_rows.length >= 4);
});

test("formula playground lets edited JSON data change the live result", () => {
  const sampleData = createDefaultFormulaPlaygroundData();
  sampleData.genes = sampleData.genes.map((item) => ({
    ...item,
    ct: 36.4,
    result: "Not Detected",
  }));

  const preview = buildFormulaPlaygroundPreview({
    ...createDefaultFormulaPlaygroundDraft(),
    dataInput: stringifyFormulaPlaygroundData(sampleData),
  });

  assert.equal(preview.formulaResult.status, "Negative");
  assert.equal(preview.outputObject.evaluated_result, "Negative");
});

test("formula playground supports pathogen tokens and persists the simplified draft", () => {
  const sampleData = createDefaultFormulaPlaygroundData();
  sampleData.selected_pathogen = "Influenza A";

  const savedDraft = writeFormulaPlaygroundDraft({
    ...createDefaultFormulaPlaygroundDraft(),
    dataInput: stringifyFormulaPlaygroundData(sampleData),
    formulaExpression: 'IF(@Pathogen(selected_pathogen).result = "Detected", "Positive", "Negative")',
  });

  assert.equal(readFormulaPlaygroundDraft().formulaExpression, savedDraft.formulaExpression);

  const preview = buildFormulaPlaygroundPreview(savedDraft);

  assert.equal(preview.selectedPathogen.label, "Influenza A");
  assert.equal(preview.formulaResult.status, "Negative");
});

test("formula playground surfaces invalid JSON without crashing the output preview", () => {
  const preview = buildFormulaPlaygroundPreview({
    ...createDefaultFormulaPlaygroundDraft(),
    dataInput: "{ invalid json",
  });

  assert.match(preview.dataError, /valid JSON/i);
  assert.equal(preview.formulaResult.status, "Error");
});

test("formula playground upgrades older saved drafts into the new simplified structure", () => {
  const preview = buildFormulaPlaygroundPreview({
    selectedGeneKey: "n",
    selectedOrganismKey: "influenza-a",
    genes: [
      { key: "e", label: "E Gene", ct: 35.1, result: "Not Detected" },
      { key: "n", label: "N Gene", ct: 32.0, result: "Detected" },
      { key: "orf1ab", label: "Orf1ab", ct: 31.8, result: "Detected" },
    ],
    organisms: [
      { key: "sars-cov-2", label: "SARS-CoV-2", detected: true, result: "Detected" },
      { key: "influenza-a", label: "Influenza A", detected: false, result: "Not Detected" },
    ],
    formulaExpression: 'IF(@Organism(selected_organism).detected, "Positive", "Negative")',
  });

  assert.equal(preview.selectedGene.label, "N Gene");
  assert.equal(preview.selectedOrganism.label, "Influenza A");
  assert.equal(preview.selectedPathogen.label, "Influenza A");
  assert.equal(preview.formulaResult.status, "Negative");
});
