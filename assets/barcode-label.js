(function initBarcodeLabel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterBarcodeLabel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212",
    "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221",
    "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221",
    "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321",
    "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131",
    "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131",
    "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111",
    "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
    "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242",
    "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311",
    "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
  ];
  const CODE128_START_B = 104;
  const CODE128_START_C = 105;
  const CODE128_CODE_B = 100;
  const CODE128_CODE_C = 99;
  const CODE128_STOP = 106;
  const DEFAULT_PAGE_WIDTH_PT = 3.5 * 72;
  const DEFAULT_PAGE_HEIGHT_PT = 1.125 * 72;
  const DEFAULT_BARCODE_WIDTH_PT = 3.1 * 72;
  const DEFAULT_BAR_HEIGHT_PT = 0.8 * 72;
  const DEFAULT_LAYOUT = Object.freeze({
    pageWidthPt: DEFAULT_PAGE_WIDTH_PT,
    pageHeightPt: DEFAULT_PAGE_HEIGHT_PT,
    maxBarcodeWidthPt: DEFAULT_BARCODE_WIDTH_PT,
    quietModules: 13,
    targetModuleWidthPt: 1.45,
    topMarginPt: 2,
    codeFontSizePt: 10.8,
    patientFontSizePt: 7.8,
    codeBaselineY: 9.8,
    patientBaselineY: 1.8,
    textInsetPt: 3,
  });

  function normalizeCode128Value(value) {
    const raw = String(value || "").trim();
    if (!raw) return "UNKNOWN";
    return Array.from(raw)
      .map((char) => {
        const code = char.charCodeAt(0);
        return code >= 32 && code <= 126 ? char : "-";
      })
      .join("");
  }

  function escapePdfString(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/[^\x20-\x7E]/g, "?");
  }

  function formatPdfNumber(value) {
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber)) return "0";
    return String(Math.round(asNumber * 1000) / 1000);
  }

  function countLeadingDigits(value, startIndex) {
    let count = 0;
    for (let index = startIndex; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 48 || code > 57) break;
      count += 1;
    }
    return count;
  }

  function encodeCode128BChar(char) {
    return char.charCodeAt(0) - 32;
  }

  function shouldStartWithCodeC(payload) {
    const leadingDigits = countLeadingDigits(payload, 0);
    return leadingDigits >= 4 && leadingDigits % 2 === 0;
  }

  function buildCode128CodeSequence(value) {
    const payload = normalizeCode128Value(value);
    const codes = [shouldStartWithCodeC(payload) ? CODE128_START_C : CODE128_START_B];
    let activeCodeSet = codes[0] === CODE128_START_C ? "C" : "B";
    let index = 0;

    while (index < payload.length) {
      const digitRunLength = countLeadingDigits(payload, index);
      if (activeCodeSet === "C") {
        if (digitRunLength >= 2) {
          const pairCount = Math.floor(digitRunLength / 2);
          for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
            codes.push(Number(payload.slice(index, index + 2)));
            index += 2;
          }
          if (digitRunLength % 2 === 0) continue;
        }
        codes.push(CODE128_CODE_B);
        activeCodeSet = "B";
        continue;
      }

      if (digitRunLength >= 4) {
        if (digitRunLength % 2 === 1) {
          codes.push(encodeCode128BChar(payload[index]));
          index += 1;
          continue;
        }
        codes.push(CODE128_CODE_C);
        activeCodeSet = "C";
        continue;
      }

      codes.push(encodeCode128BChar(payload[index]));
      index += 1;
    }

    let checksum = codes[0];
    for (let codeIndex = 1; codeIndex < codes.length; codeIndex += 1) {
      checksum += codes[codeIndex] * codeIndex;
    }
    checksum %= 103;
    codes.push(checksum, CODE128_STOP);
    return { payload, codes };
  }

  function measureCode128Modules(codes, quietModules = DEFAULT_LAYOUT.quietModules) {
    return (quietModules * 2) + codes.reduce((sum, code) => {
      const pattern = CODE128_PATTERNS[code] || "";
      return sum + pattern.split("").reduce((inner, segment) => inner + Number(segment || 0), 0);
    }, 0);
  }

  function buildBarcodeLayout(codes, options = {}) {
    const layout = {
      ...DEFAULT_LAYOUT,
      ...options,
    };
    const totalModules = measureCode128Modules(codes, layout.quietModules);
    const desiredWidthPt = totalModules * layout.targetModuleWidthPt;
    const drawWidthPt = Math.min(layout.maxBarcodeWidthPt, desiredWidthPt);
    const moduleWidthPt = drawWidthPt / Math.max(1, totalModules);
    const quietZoneWidthPt = layout.quietModules * moduleWidthPt;
    const leftMarginPt = (layout.pageWidthPt - drawWidthPt) / 2;
    const barStartXPt = leftMarginPt + quietZoneWidthPt;
    const barHeightPt = Math.min(DEFAULT_BAR_HEIGHT_PT, layout.pageHeightPt - layout.topMarginPt - 18);
    const barBottomPt = layout.pageHeightPt - layout.topMarginPt - barHeightPt;
    return {
      ...layout,
      totalModules,
      drawWidthPt,
      moduleWidthPt,
      quietZoneWidthPt,
      leftMarginPt,
      barStartXPt,
      barHeightPt,
      barBottomPt,
    };
  }

  function buildSimplePdfDocument({ pageWidthPt, pageHeightPt, contentStream }) {
    const objects = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
    objects[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatPdfNumber(pageWidthPt)} ${formatPdfNumber(pageHeightPt)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`;
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[5] = `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`;

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let objectIndex = 1; objectIndex < objects.length; objectIndex += 1) {
      offsets[objectIndex] = pdf.length;
      pdf += `${objectIndex} 0 obj\n${objects[objectIndex]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n`;
    pdf += "0000000000 65535 f \n";
    for (let objectIndex = 1; objectIndex < offsets.length; objectIndex += 1) {
      pdf += `${String(offsets[objectIndex]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return pdf;
  }

  function buildLabelPdfModel({ barcodeValue, patientLine }) {
    const { payload, codes } = buildCode128CodeSequence(barcodeValue);
    const labelLayout = buildBarcodeLayout(codes);
    const codeLine = escapePdfString(payload).slice(0, 28);
    const patientText = escapePdfString(patientLine).slice(0, 72);
    const textXPt = labelLayout.barStartXPt;
    const commands = ["0 0 0 rg"];

    let cursorX = labelLayout.leftMarginPt + labelLayout.quietZoneWidthPt;
    codes.forEach((code) => {
      const pattern = CODE128_PATTERNS[code];
      if (!pattern) return;
      for (let index = 0; index < pattern.length; index += 1) {
        const segmentWidth = Number(pattern[index]) * labelLayout.moduleWidthPt;
        if (index % 2 === 0) {
          commands.push(
            `${formatPdfNumber(cursorX)} ${formatPdfNumber(labelLayout.barBottomPt)} ${formatPdfNumber(segmentWidth)} ${formatPdfNumber(labelLayout.barHeightPt)} re f`
          );
        }
        cursorX += segmentWidth;
      }
    });

    commands.push(`BT /F1 ${formatPdfNumber(labelLayout.codeFontSizePt)} Tf ${formatPdfNumber(textXPt)} ${formatPdfNumber(labelLayout.codeBaselineY)} Td (${codeLine}) Tj ET`);
    commands.push(`BT /F1 ${formatPdfNumber(labelLayout.patientFontSizePt)} Tf ${formatPdfNumber(textXPt)} ${formatPdfNumber(labelLayout.patientBaselineY)} Td (${patientText}) Tj ET`);

    return {
      payload,
      codes,
      labelLayout,
      codeLine,
      patientText,
      codeTextXPt: textXPt,
      patientTextXPt: textXPt,
      commands,
    };
  }

  function buildLabelPdfBlob({ barcodeValue, patientLine }) {
    const model = buildLabelPdfModel({ barcodeValue, patientLine });
    const pdf = buildSimplePdfDocument({
      pageWidthPt: model.labelLayout.pageWidthPt,
      pageHeightPt: model.labelLayout.pageHeightPt,
      contentStream: model.commands.join("\n"),
    });
    return new Blob([pdf], { type: "application/pdf" });
  }

  return {
    buildBarcodeLayout,
    buildCode128CodeSequence,
    buildLabelPdfBlob,
    buildLabelPdfModel,
    measureCode128Modules,
    normalizeCode128Value,
  };
});
