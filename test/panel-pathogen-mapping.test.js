const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mapping = require(path.join(root, "assets", "panel-pathogen-mapping.js"));

test("panel pathogen mapping exposes workbook-derived panel target lists", () => {
  assert.deepEqual(mapping.getPanelPathogenGroups("basic-flu-panel")[0].pathogens, [
    "Influenza A",
    "Influenza B",
    "Respiratory Syncytial Virus A/B",
    "SARS-CoV-2",
  ]);
  assert.equal(mapping.getPanelPathogens("basic-flu-panel").length, 24);
  assert.equal(mapping.antibioticResistanceGenes.length, 20);
  assert.equal(mapping.getPanelPathogens("respiratory-pathogens-panel").length, 56);
  assert.equal(mapping.getPanelPathogens("gastrointestinal-panel").length, 57);
  assert.equal(mapping.getPanelPathogens("nail-panel").length, 37);
  assert.equal(mapping.getPanelPathogens("wound-panel").length, 40);
  assert.ok(mapping.getPanelPathogens("womens-health-panel").includes("Gardnerella vaginalis"));
  assert.ok(mapping.getPanelPathogens("nail-panel").includes("Trichophyton interdigitale"));
  assert.ok(mapping.getPanelPathogens("uti-pcr-panel").includes("KPC"));
});

test("panel pathogen mapping groups targets by workbook type", () => {
  assert.deepEqual(
    mapping.getPanelPathogenGroups("sti-panel").map((group) => [group.type, group.pathogens.length]),
    [
      ["Bacterium", 8],
      ["Parasite", 1],
      ["Virus", 2],
      ["ABR Genes", 20],
    ]
  );
  assert.deepEqual(
    mapping.getPanelPathogenGroups("uti-pcr-panel").map((group) => [group.type, group.pathogens.length]),
    [
      ["Bacterium", 21],
      ["Fungus", 7],
      ["ABR Genes", 20],
    ]
  );
  assert.deepEqual(
    mapping.getPanelPathogenGroups("nail-panel").map((group) => [group.type, group.pathogens.length]),
    [
      ["Fungus", 17],
      ["ABR Genes", 20],
    ]
  );
  assert.deepEqual(
    mapping.getPanelPathogenGroups("molecular-test").map((group) => [group.type, group.pathogens.length]),
    [
      ["ABR Genes", 20],
    ]
  );
});

test("panel pathogen mapping returns copies and merges without duplicates", () => {
  const flu = mapping.getPanelPathogens("basic-flu-panel");
  flu.push("Synthetic extra");

  assert.equal(mapping.getPanelPathogens("basic-flu-panel").includes("Synthetic extra"), false);

  const merged = mapping.mergePanelPathogens(["basic-flu-panel", "respiratory-pathogens-panel"]);
  assert.equal(merged.filter((pathogen) => pathogen === "Influenza A").length, 1);
  assert.equal(merged.filter((pathogen) => pathogen === "KPC").length, 1);
  assert.equal(merged.includes("Bordetella pertussis"), true);

  const groups = mapping.mergePanelPathogenGroups(["basic-flu-panel", "respiratory-pathogens-panel"]);
  const virusGroup = groups.find((group) => group.type === "Virus");
  const abrGroup = groups.find((group) => group.type === "ABR Genes");
  assert.equal(virusGroup.pathogens.filter((pathogen) => pathogen === "Influenza A").length, 1);
  assert.equal(abrGroup.pathogens.filter((pathogen) => pathogen === "KPC").length, 1);
});

test("requisition creation persists selected pathogen labels on service rows", () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(appSource, /function renderPathogenChecklist\s*\(/);
  assert.match(appSource, /getAvailablePathogenGroupsForRow\(row\)/);
  assert.match(appSource, /order-pathogen-group-title/);
  assert.match(appSource, /data-pathogen-select-group/);
  assert.match(appSource, /data-pathogen-clear-group/);
  assert.match(appSource, /selectAllPathogensForRow\(row\)/);
  assert.match(appSource, /orderState\.openPicker = null;/);
  assert.match(appSource, /selectedPathogens,/);
});
