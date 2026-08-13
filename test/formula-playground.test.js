const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDefaultFormulaPlaygroundData,
  stringifyFormulaPlaygroundData,
  createDefaultFormulaPlaygroundDraft,
  writeFormulaPlaygroundDraft,
  readFormulaPlaygroundDraft,
  writeFormulaPlaygroundInputView,
  writeFormulaPlaygroundOutputView,
  updateFormulaPlaygroundDraftSelection,
  updateFormulaPlaygroundDraftRow,
  runFormulaPlaygroundDraft,
  resetFormulaPlaygroundDraft,
  buildFormulaPlaygroundPreview,
} = require("../assets/formula-playground.js");

test.afterEach(() => {
  resetFormulaPlaygroundDraft();
});

test("formula playground default preview evaluates the starter SARS-CoV-2 expression", () => {
  const preview = buildFormulaPlaygroundPreview(createDefaultFormulaPlaygroundDraft());

  assert.equal(preview.formulaResult.status, "Positive");
  assert.equal(preview.formulaResult.error, "");
  assert.equal(preview.inputView, "json");
  assert.equal(preview.outputView, "json");
  assert.equal(preview.selectedPanel.label, "Respiratory Pathogens Panel");
  assert.equal(preview.formulaEnabled, true);
  assert.equal(preview.formulaActive, true);
  assert.equal(preview.selectedGene.label, "E Gene");
  assert.equal(preview.selectedOrganism.label, "SARS-CoV-2");
  assert.equal(preview.selectedPathogen.label, "SARS-CoV-2");
  assert.equal(preview.outputObject.evaluated_result, "Positive");
  assert.equal(preview.outputObject.average_positive_ct, 32);
  assert.equal(preview.outputObject.formula_enabled, true);
  assert.equal(preview.outputObject.formula_applied, true);
  assert.deepEqual(
    preview.outputRows.filter((row) => row.kind === "gene").map((row) => row.label),
    []
  );
  assert.equal(preview.outputRows[0].label, "SARS-CoV-2");
  assert.equal(preview.outputRows[0].ct, 32);
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
  assert.equal(preview.outputObject.average_positive_ct, null);
});

test("formula playground keeps showing the last run output until Run Formula is requested", () => {
  buildFormulaPlaygroundPreview();

  const sampleData = createDefaultFormulaPlaygroundData();
  sampleData.genes = sampleData.genes.map((item) => ({
    ...item,
    ct: 36.4,
    result: "Not Detected",
  }));

  writeFormulaPlaygroundDraft({
    ...createDefaultFormulaPlaygroundDraft(),
    dataInput: stringifyFormulaPlaygroundData(sampleData),
  });

  const beforeRun = buildFormulaPlaygroundPreview();
  assert.equal(beforeRun.formulaResult.status, "Positive");
  assert.equal(beforeRun.hasPendingChanges, true);

  runFormulaPlaygroundDraft();

  const afterRun = buildFormulaPlaygroundPreview();
  assert.equal(afterRun.formulaResult.status, "Negative");
  assert.equal(afterRun.hasPendingChanges, false);
});

test("formula playground can switch data input between JSON and table views", () => {
  writeFormulaPlaygroundInputView("table");

  const preview = buildFormulaPlaygroundPreview();

  assert.equal(preview.inputView, "table");
  assert.deepEqual(preview.inputModel.selections.map((row) => row.label), [
    "Selected Panel",
    "Selected Gene",
    "Selected Organism",
    "Selected Pathogen",
  ]);
  assert.deepEqual(preview.inputModel.sections.map((section) => section.title), [
    "Genes",
    "Organisms",
    "Pathogens",
  ]);
});

test("formula playground does not apply the SARS-CoV-2 formula to a non-respiratory panel", () => {
  const sampleData = createDefaultFormulaPlaygroundData();
  sampleData.selected_panel = "Urinary Tract Infection Panel";

  const preview = buildFormulaPlaygroundPreview({
    ...createDefaultFormulaPlaygroundDraft(),
    dataInput: stringifyFormulaPlaygroundData(sampleData),
  });

  assert.equal(preview.formulaEnabled, true);
  assert.equal(preview.formulaActive, false);
  assert.equal(preview.formulaResult.status, "Formula Not Applied");
  assert.equal(preview.outputObject.formula_applied, false);
  assert.ok(preview.outputRows.some((row) => row.kind === "gene" && row.label === "E Gene"));
});

test("formula playground averages detected positive target values and excludes a not-detected Ct", () => {
  const sampleData = createDefaultFormulaPlaygroundData();
  sampleData.genes = [
    { label: "E Gene", ct: 27, result: "Detected" },
    { label: "N Gene", ct: 20, result: "Detected" },
    { label: "Orf1ab", ct: 25, result: "Not Detected" },
  ];

  const preview = buildFormulaPlaygroundPreview({
    ...createDefaultFormulaPlaygroundDraft(),
    dataInput: stringifyFormulaPlaygroundData(sampleData),
  });

  assert.equal(preview.formulaResult.status, "Positive");
  assert.equal(preview.formulaResult.ct, 23.5);
  assert.equal(preview.outputRows[0].ct, 23.5);
});

test("formula playground can switch processed output between JSON and table views", () => {
  writeFormulaPlaygroundOutputView("table");

  const preview = buildFormulaPlaygroundPreview();

  assert.equal(preview.outputView, "table");
  assert.deepEqual(preview.outputTable.columns.map((column) => column.label), [
    "Type",
    "Label",
    "Result",
    "Ct",
    "Detected",
    "Selected",
    "Formula Status",
  ]);
  assert.ok(preview.outputTable.rows.length >= 4);
});

test("formula playground table helpers update selections and row values inside the JSON draft", () => {
  const geneSelectionDraft = updateFormulaPlaygroundDraftSelection(
    "selected_gene",
    "N Gene",
    createDefaultFormulaPlaygroundDraft()
  );
  const ctUpdatedDraft = updateFormulaPlaygroundDraftRow("genes", 0, "ct", "29.4", geneSelectionDraft);
  const detectedUpdatedDraft = updateFormulaPlaygroundDraftRow("organisms", 1, "detected", "true", ctUpdatedDraft);

  const preview = buildFormulaPlaygroundPreview(detectedUpdatedDraft);

  assert.equal(preview.draftData.selected_gene, "N Gene");
  assert.equal(preview.draftData.genes[0].ct, 29.4);
  assert.equal(preview.draftData.organisms[1].detected, true);
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
