const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildManualTranscriptionLookupMarkup,
  buildManualTranscriptionResultFieldMarkup,
  buildManualTranscriptionTargetFieldMarkup,
  createManualTranscriptionUiModel,
  createManualTranscriptionReport,
  getManualTranscriptionPathogenOptions,
  getManualTranscriptionResistanceOptions,
  resolveManualTranscriptionStatus,
  normalizeManualTranscriptionReport,
} = require("../assets/manual-transcription.js");

test("manual transcription draft starts empty and keeps the order sample id", () => {
  const report = createManualTranscriptionReport({
    panelName: "Respiratory Panel",
    accessionNo: "EY1006202600006",
  });

  assert.equal(report.panelName, "Respiratory Panel");
  assert.deepEqual(report.summary, {
    sampleCount: 0,
    totalRows: 0,
    detectedCount: 0,
  });
  assert.deepEqual(report.metadata, {
    entryMode: "manual-transcription",
    defaultSampleId: "EY1006202600006",
    manualEditNote: "",
  });
  assert.deepEqual(report.detected, []);
  assert.deepEqual(report.detailed, []);
});

test("manual transcription status promotes blank and pending orders to processed", () => {
  assert.equal(resolveManualTranscriptionStatus(""), "Processed");
  assert.equal(resolveManualTranscriptionStatus("Pending"), "Processed");
  assert.equal(resolveManualTranscriptionStatus("Complete"), "Complete");
});

test("manual transcription suggestions honor panel aliases and keep only matching pathogens", () => {
  const registryRows = [
    {
      scientific_name: "Influenza A virus",
      common_name: "Influenza A",
      type: "virus",
      status: "active",
      panels: ["Respiratory Pathogen Panel"],
    },
    {
      scientific_name: "SARS-CoV-2",
      common_name: "COVID-19 virus",
      type: "virus",
      status: "active",
      panels: ["Respiratory Pathogen Panel"],
    },
    {
      scientific_name: "Pseudomonas aeruginosa",
      common_name: "",
      type: "bacteria",
      status: "active",
      panels: ["Eye Infection Panel"],
    },
  ];

  const options = getManualTranscriptionPathogenOptions({
    panelName: "Respiratory Pathogens Panel",
    masterRegistryRecords: registryRows,
  });

  assert.deepEqual(
    options.map((option) => option.value),
    ["Influenza A virus", "SARS-CoV-2"]
  );

  const uiModel = createManualTranscriptionUiModel({
    orderId: "42",
    panelName: "Respiratory Pathogens Panel",
    accessionNo: "RP00042",
    masterRegistryRecords: registryRows,
    masterResistanceGeneCatalog: [
      {
        gene: "mecA",
        resistanceClass: "Methicillin Resistance Marker",
        status: "active",
      },
    ],
  });

  assert.equal(uiModel.pathogenListId, "transcribe-pathogen-options-42");
  assert.equal(uiModel.abrGeneListId, "transcribe-abr-options-42");
  assert.equal(uiModel.pathogenOptions.length, 2);
  assert.equal(uiModel.abrGeneOptions.length, 1);
});

test("manual transcription normalization removes empty starter rows and recalculates summary", () => {
  const normalized = normalizeManualTranscriptionReport({
    panelName: "Eye Panel",
    summary: {},
    metadata: {
      entryMode: "manual-transcription",
      defaultSampleId: "EY1006202600006",
      manualEditNote: "",
    },
    detected: [],
    detailed: [
      {
        sample: "EY1006202600006",
        pathogen: "",
        result: "Not Detected",
        ctValue: "",
        recordType: "pathogen",
      },
      {
        sample: "EY1006202600006",
        pathogen: "Pseudomonas aeruginosa",
        result: "detected - low",
        ctValue: "31",
        recordType: "pathogen",
      },
    ],
  });

  assert.equal(normalized.detailed.length, 1);
  assert.equal(normalized.detected.length, 1);
  assert.equal(normalized.detailed[0].result, "Detected - Low");
  assert.equal(normalized.detailed[0].classification, "Low");
  assert.equal(normalized.summary.sampleCount, 1);
  assert.equal(normalized.summary.totalRows, 1);
  assert.equal(normalized.summary.detectedCount, 1);
});

test("manual transcription resistance options stay active, descriptive, and alphabetized", () => {
  const options = getManualTranscriptionResistanceOptions({
    masterResistanceGeneCatalog: [
      {
        gene: "vanA",
        resistanceClass: "Vancomycin Resistance Marker",
        status: "active",
      },
      {
        gene: "blaKPC",
        resistanceClass: "Carbapenemase Marker",
        status: "active",
      },
      {
        gene: "mecC",
        resistanceClass: "Methicillin Resistance Marker",
        status: "inactive",
      },
    ],
  });

  assert.deepEqual(
    options.map((option) => option.value),
    ["blaKPC", "vanA"]
  );
  assert.equal(options[0].description, "blaKPC - Carbapenemase Marker");
  assert.equal(options[1].description, "vanA - Vancomycin Resistance Marker");
});

test("manual transcription lookup markup exposes searchable pathogen and ABR datalists", () => {
  const model = createManualTranscriptionUiModel({
    orderId: "17",
    panelName: "Respiratory Panel",
    accessionNo: "RP0017",
    masterRegistryRecords: [
      {
        scientific_name: "Influenza A virus",
        common_name: "Influenza A",
        type: "virus",
        status: "active",
        panels: ["Respiratory Panel"],
      },
    ],
    masterResistanceGeneCatalog: [
      {
        gene: "mecA",
        resistanceClass: "Methicillin Resistance Marker",
        status: "active",
      },
    ],
  });

  const markup = buildManualTranscriptionLookupMarkup(model);

  assert.match(markup, /Searchable pathogen dropdown/);
  assert.match(markup, /Panel-aware suggestions/);
  assert.match(markup, /Standardized result selections/);
  assert.match(markup, /datalist id="transcribe-pathogen-options-17"/);
  assert.match(markup, /Influenza A virus - Influenza A \/ virus/);
  assert.match(markup, /datalist id="transcribe-abr-options-17"/);
  assert.match(markup, /mecA - Methicillin Resistance Marker/);
});

test("manual transcription field markup binds the correct list ids and selected result", () => {
  const model = createManualTranscriptionUiModel({
    orderId: "88",
    panelName: "Eye Panel",
    accessionNo: "EYE0088",
    masterRegistryRecords: [
      {
        scientific_name: "Pseudomonas aeruginosa",
        common_name: "",
        type: "bacteria",
        status: "active",
        panels: ["Eye Infection Panel"],
      },
    ],
    masterResistanceGeneCatalog: [
      {
        gene: "qnrS",
        resistanceClass: "Fluoroquinolone Resistance Marker",
        status: "active",
      },
    ],
  });

  const pathogenFieldMarkup = buildManualTranscriptionTargetFieldMarkup({
    model,
    item: { pathogen: "Pseudomonas aeruginosa" },
    kind: "pathogen",
    sourceIndex: 0,
  });
  const abrFieldMarkup = buildManualTranscriptionTargetFieldMarkup({
    model,
    item: { pathogen: "qnrS" },
    kind: "abr",
    sourceIndex: 1,
  });
  const resultFieldMarkup = buildManualTranscriptionResultFieldMarkup({
    model,
    value: "detected - low",
    sourceIndex: 0,
  });

  assert.match(pathogenFieldMarkup, /list="transcribe-pathogen-options-88"/);
  assert.match(pathogenFieldMarkup, /Select panel pathogen/);
  assert.match(pathogenFieldMarkup, /1 panel targets/);
  assert.match(abrFieldMarkup, /list="transcribe-abr-options-88"/);
  assert.match(abrFieldMarkup, /Select ABR gene/);
  assert.match(abrFieldMarkup, /1 ABR gene options/);
  assert.match(resultFieldMarkup, /<option value="Detected - Low" selected>Detected - Low<\/option>/);
  assert.match(resultFieldMarkup, /Standardized result/);
});
