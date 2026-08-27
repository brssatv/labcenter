(function initPanelPathogenMapping(root) {
  function freezeGroups(groups) {
    return Object.freeze(groups.map((group) => Object.freeze({
      type: group.type,
      pathogens: Object.freeze([...group.pathogens]),
    })));
  }

  const antibioticResistanceGenes = Object.freeze([
    "AmpC",
    "mecA",
    "femA",
    "QnrB",
    "QnrA",
    "vanA1",
    "vanA2",
    "vanB",
    "NDM",
    "KPC",
    "OXA-48",
    "VIM",
    "IMP-7",
    "SHV",
    "TEM",
    "CTX-M1",
    "CTX-M2",
    "mefA",
    "ErmA",
    "ErmB",
  ]);

  function withAbrGroups(groups) {
    return freezeGroups([
      ...groups,
      {
        type: "ABR Genes",
        pathogens: antibioticResistanceGenes,
      },
    ]);
  }

  const panelPathogenGroupsById = Object.freeze({
    "basic-flu-panel": withAbrGroups([
      {
        type: "Virus",
        pathogens: [
          "Influenza A",
          "Influenza B",
          "Respiratory Syncytial Virus A/B",
          "SARS-CoV-2",
        ],
      },
    ]),
    "nail-panel": withAbrGroups([
      {
        type: "Fungus",
        pathogens: [
          "Epidermophyton floccosum",
          "Alternaria alternata",
          "Acremonium strictum",
          "Aspergillus terreus",
          "Trichophyton spp",
          "Fusarium solani",
          "Aspergillus niger",
          "Microsporum audouinii / Microsporum canis",
          "Trichophyton interdigitale",
          "Neofusicoccum mangiferae",
          "Candida krusei",
          "Candida albicans",
          "Candida glabrata",
          "Candida tropicalis",
          "Candida lusitaniae",
          "Candida auris",
          "Candida parapsilosis",
        ],
      },
    ]),
    "molecular-test": freezeGroups([
      {
        type: "ABR Genes",
        pathogens: antibioticResistanceGenes,
      },
    ]),
    "respiratory-pathogens-panel": withAbrGroups([
      {
        type: "Virus",
        pathogens: [
          "Parainfluenza Virus 1",
          "Parainfluenza Virus 2",
          "Parainfluenza Virus 3",
          "Parainfluenza Virus 4",
          "Parechovirus",
          "Respiratory Syncytial Virus A",
          "Respiratory Syncytial Virus B",
          "Rhinovirus",
          "SARS-CoV-2 (COVID-19)",
          "SARS",
          "Adenovirus",
          "Bocavirus",
          "Coronavirus 229E",
          "Coronavirus HKU1",
          "Coronavirus NL63",
          "Coronavirus OC43",
          "Enterovirus",
          "Influenza A",
          "Influenza B",
          "Metapneumovirus A&B",
        ],
      },
      {
        type: "Bacterium",
        pathogens: [
          "Bordetella holmesii",
          "Bordetella pertussis",
          "Chlamydophila pneumoniae",
          "Haemophilus influenzae",
          "Haemophilus influenzae type b",
          "Klebsiella pneumoniae",
          "Legionella pneumophila",
          "Moraxella catarrhalis",
          "Mycoplasma pneumoniae",
          "Staphylococcus aureus",
          "Streptococcus pneumoniae",
          "Group C & G Strep",
          "Group B Strep",
          "Coxiella burnetii",
          "Group A Strep",
        ],
      },
      {
        type: "Fungus",
        pathogens: [
          "Pneumocystis jirovecii",
        ],
      },
    ]),
    "eye-panel": withAbrGroups([
      {
        type: "Bacterium",
        pathogens: [
          "Pseudomonas aeruginosa",
          "Chlamydia trachomatis",
          "Staphylococcus aureus",
          "Streptococcus pneumoniae",
        ],
      },
      {
        type: "Virus",
        pathogens: [
          "Herpes Simplex Virus (HSV-1)",
          "Varicella-zoster virus (HHV-3)",
        ],
      },
    ]),
    "gastrointestinal-panel": withAbrGroups([
      {
        type: "Virus",
        pathogens: [
          "Adenovirus",
          "Astrovirus I",
          "Norovirus G1",
          "Norovirus G2",
          "Rotavirus A",
          "Sapovirus I",
          "Enterovirus PAN",
          "Human parechovirus",
          "Rotavirus B/C",
          "Enteroaggregative E. coli",
          "Enteroinvasive E. coli",
          "Enteropathogenic E. coli",
          "Enterotoxigenic E. coli",
        ],
      },
      {
        type: "Bacterium",
        pathogens: [
          "STEC",
          "Vibrio vulnificus",
          "Clostridium novyi",
          "Clostridium perfringens",
          "Salmonella spp",
          "Shigella spp",
          "Clostridium difficile",
          "E. coli O157",
          "Campylobacter spp",
          "Campylobacter coli",
          "Vibrio cholerae-OmpW",
          "Hypervirulent C. diff 027",
          "Campylobacter jejuni",
          "Helicobacter pylori",
          "Yersinia enterocolitica",
          "Plesiomonas shigelloides",
          "Listeria monocytogenes",
          "Vibrio parahaemolyticus",
          "Clostridium septicum",
        ],
      },
      {
        type: "Parasite",
        pathogens: [
          "Cyclospora cayetanensis",
          "Giardia lamblia",
          "Cryptosporidium spp",
          "Dientamoeba fragilis",
          "Entamoeba histolytica",
        ],
      },
    ]),
    "sti-panel": withAbrGroups([
      {
        type: "Bacterium",
        pathogens: [
          "Chlamydia trachomatis",
          "Mycoplasma hominis",
          "Neisseria gonorrhoeae",
          "Ureaplasma parvum",
          "Treponema pallidum",
          "Mycoplasma genitalium",
          "Ureaplasma urealyticum",
          "Haemophilus ducreyi",
        ],
      },
      {
        type: "Parasite",
        pathogens: [
          "Trichomonas vaginalis",
        ],
      },
      {
        type: "Virus",
        pathogens: [
          "Herpes Simplex Virus (HSV-1)",
          "Herpes Simplex Virus (HSV-2)",
        ],
      },
    ]),
    "uti-pcr-panel": withAbrGroups([
      {
        type: "Bacterium",
        pathogens: [
          "Proteus vulgaris",
          "Providencia stuartii",
          "Pseudomonas aeruginosa",
          "Serratia marcescens",
          "Staphylococcus aureus",
          "Klebsiella aerogenes",
          "Morganella morganii",
          "Mycoplasma hominis",
          "Proteus mirabilis",
          "Staphylococcus saprophyticus",
          "Streptococcus agalactiae",
          "Ureaplasma urealyticum",
          "Klebsiella pneumoniae",
          "Klebsiella oxytoca",
          "Acinetobacter baumannii",
          "Citrobacter freundii",
          "Enterobacter cloacae",
          "Enterococcus faecalis",
          "Enterococcus faecium",
          "Escherichia coli",
          "Streptococcus pneumoniae",
        ],
      },
      {
        type: "Fungus",
        pathogens: [
          "Candida albicans",
          "Candida auris",
          "Candida glabrata",
          "Candida krusei",
          "Candida lusitaniae",
          "Candida parapsilosis",
          "Candida tropicalis",
        ],
      },
    ]),
    "womens-health-panel": withAbrGroups([
      {
        type: "Bacterium",
        pathogens: [
          "Lactobacillus iners",
          "Lactobacillus jensenii",
          "Megasphaera type 1",
          "Megasphaera type 2",
          "Mycoplasma hominis",
          "Staphylococcus aureus",
          "Streptococcus agalactiae",
          "Neisseria gonorrhoeae",
          "Ureaplasma parvum",
          "Ureaplasma urealyticum",
          "Atopobium vaginae",
          "BVAB2",
          "Enterococcus faecalis",
          "Escherichia coli",
          "Gardnerella vaginalis",
          "Lactobacillus crispatus",
        ],
      },
      {
        type: "Fungus",
        pathogens: [
          "Candida albicans",
          "Candida glabrata",
          "Candida parapsilosis",
          "Candida tropicalis",
        ],
      },
    ]),
    "wound-panel": withAbrGroups([
      {
        type: "Bacterium",
        pathogens: [
          "Proteus vulgaris",
          "Proteus mirabilis",
          "Pseudomonas aeruginosa",
          "Morganella morganii",
          "Klebsiella aerogenes",
          "Klebsiella oxytoca",
          "Klebsiella pneumoniae",
          "Kingella kingae",
          "Staphylococcus aureus",
          "Staphylococcus saprophyticus",
          "Acinetobacter baumannii",
          "Bacteroides fragilis",
          "Clostridium novyi",
          "Clostridium perfringens",
          "Clostridium septicum",
          "Enterococcus faecalis",
          "Enterococcus faecium",
          "Escherichia coli",
          "Citrobacter freundii",
          "Enterobacter cloacae",
        ],
      },
    ]),
  });

  const panelPathogensById = Object.freeze(Object.fromEntries(
    Object.entries(panelPathogenGroupsById).map(([panelId, groups]) => [
      panelId,
      Object.freeze(groups.flatMap((group) => group.pathogens)),
    ])
  ));

  function normalizePathogenKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function getPanelPathogenGroups(panelId) {
    return (panelPathogenGroupsById[String(panelId || "").trim()] || [])
      .map((group) => ({ type: group.type, pathogens: [...group.pathogens] }));
  }

  function getPanelPathogens(panelId) {
    return [...(panelPathogensById[String(panelId || "").trim()] || [])];
  }

  function mergePanelPathogenGroups(panelIds = []) {
    const groupsByType = new Map();
    const seen = new Set();
    (Array.isArray(panelIds) ? panelIds : []).forEach((panelId) => {
      getPanelPathogenGroups(panelId).forEach((group) => {
        if (!groupsByType.has(group.type)) groupsByType.set(group.type, []);
        const items = groupsByType.get(group.type);
        group.pathogens.forEach((pathogen) => {
          const key = normalizePathogenKey(pathogen);
          if (!key || seen.has(key)) return;
          seen.add(key);
          items.push(pathogen);
        });
      });
    });
    return Array.from(groupsByType, ([type, pathogens]) => ({ type, pathogens }));
  }

  function mergePanelPathogens(panelIds = []) {
    return mergePanelPathogenGroups(panelIds).flatMap((group) => group.pathogens);
  }

  const api = Object.freeze({
    antibioticResistanceGenes,
    panelPathogenGroupsById,
    panelPathogensById,
    normalizePathogenKey,
    getPanelPathogenGroups,
    getPanelPathogens,
    mergePanelPathogenGroups,
    mergePanelPathogens,
  });

  root.LabCenterPanelPathogens = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
