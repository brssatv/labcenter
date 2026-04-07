#!/usr/bin/env swift

import AppKit
import Foundation
import PDFKit
import Vision

struct OCRPayload: Encodable {
  let text: String
  let lines: [String]
  let pageCount: Int
}

enum OCRScriptError: LocalizedError {
  case usage
  case inputMissing
  case unsupportedType
  case imageLoadFailed
  case pdfLoadFailed
  case pageRenderFailed

  var errorDescription: String? {
    switch self {
    case .usage:
      return "Usage: ocr-requisition-scan.swift <input-file>"
    case .inputMissing:
      return "The provided scan file could not be found."
    case .unsupportedType:
      return "Unsupported scan format. Use PDF, PNG, JPG, HEIC, or TIFF."
    case .imageLoadFailed:
      return "Unable to load the uploaded image for OCR."
    case .pdfLoadFailed:
      return "Unable to load the uploaded PDF for OCR."
    case .pageRenderFailed:
      return "Unable to render one of the PDF pages for OCR."
    }
  }
}

func normalizeLine(_ value: String) -> String {
  value
    .replacingOccurrences(of: "\u{00A0}", with: " ")
    .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    .trimmingCharacters(in: .whitespacesAndNewlines)
}

func dedupeLines(_ values: [String]) -> [String] {
  var seen = Set<String>()
  var output: [String] = []

  for value in values {
    let cleaned = normalizeLine(value)
    if cleaned.isEmpty { continue }
    let key = cleaned.lowercased()
    if seen.insert(key).inserted {
      output.append(cleaned)
    }
  }

  return output
}

func recognizedLines(from cgImage: CGImage) throws -> [String] {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  if #available(macOS 13.0, *) {
    request.automaticallyDetectsLanguage = true
  }

  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  try handler.perform([request])

  let observations = request.results ?? []
  return observations.compactMap { observation in
    observation.topCandidates(1).first?.string
  }
}

func cgImage(from image: NSImage) -> CGImage? {
  var rect = NSRect(origin: .zero, size: image.size)
  return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

func renderPDFPage(_ page: PDFPage) throws -> CGImage {
  let bounds = page.bounds(for: .mediaBox)
  let safeWidth = max(bounds.width, 1)
  let safeHeight = max(bounds.height, 1)
  let scale = max(2.2, min(3.0, 2200.0 / max(safeWidth, safeHeight)))
  let pixelWidth = max(Int(safeWidth * scale), 1200)
  let pixelHeight = max(Int(safeHeight * scale), 1200)

  guard
    let bitmap = NSBitmapImageRep(
      bitmapDataPlanes: nil,
      pixelsWide: pixelWidth,
      pixelsHigh: pixelHeight,
      bitsPerSample: 8,
      samplesPerPixel: 4,
      hasAlpha: true,
      isPlanar: false,
      colorSpaceName: .deviceRGB,
      bytesPerRow: 0,
      bitsPerPixel: 0
    ),
    let graphicsContext = NSGraphicsContext(bitmapImageRep: bitmap)
  else {
    throw OCRScriptError.pageRenderFailed
  }

  let context = graphicsContext.cgContext
  context.setFillColor(NSColor.white.cgColor)
  context.fill(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
  context.saveGState()
  context.translateBy(x: 0, y: CGFloat(pixelHeight))
  context.scaleBy(x: CGFloat(pixelWidth) / safeWidth, y: -CGFloat(pixelHeight) / safeHeight)
  page.draw(with: .mediaBox, to: context)
  context.restoreGState()

  guard let image = bitmap.cgImage else {
    throw OCRScriptError.pageRenderFailed
  }
  return image
}

func extractPDFLines(from url: URL) throws -> OCRPayload {
  guard let document = PDFDocument(url: url) else {
    throw OCRScriptError.pdfLoadFailed
  }

  var collected: [String] = []
  let pageCount = max(document.pageCount, 1)

  for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else { continue }

    let nativeTextLines = dedupeLines((page.string ?? "").components(separatedBy: .newlines))
    if nativeTextLines.count >= 3 {
      collected.append(contentsOf: nativeTextLines)
      continue
    }

    let cgImage = try renderPDFPage(page)
    collected.append(contentsOf: try recognizedLines(from: cgImage))
  }

  let lines = dedupeLines(collected)
  return OCRPayload(text: lines.joined(separator: "\n"), lines: lines, pageCount: pageCount)
}

func extractImageLines(from url: URL) throws -> OCRPayload {
  guard let image = NSImage(contentsOf: url), let cg = cgImage(from: image) else {
    throw OCRScriptError.imageLoadFailed
  }

  let lines = dedupeLines(try recognizedLines(from: cg))
  return OCRPayload(text: lines.joined(separator: "\n"), lines: lines, pageCount: 1)
}

func main() throws {
  guard CommandLine.arguments.count >= 2 else {
    throw OCRScriptError.usage
  }

  let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
  guard FileManager.default.fileExists(atPath: inputURL.path) else {
    throw OCRScriptError.inputMissing
  }

  let ext = inputURL.pathExtension.lowercased()
  let payload: OCRPayload

  switch ext {
  case "pdf":
    payload = try extractPDFLines(from: inputURL)
  case "png", "jpg", "jpeg", "heic", "heif", "tif", "tiff":
    payload = try extractImageLines(from: inputURL)
  default:
    throw OCRScriptError.unsupportedType
  }

  let encoder = JSONEncoder()
  let data = try encoder.encode(payload)
  guard let output = String(data: data, encoding: .utf8) else {
    throw OCRScriptError.pageRenderFailed
  }
  FileHandle.standardOutput.write(Data(output.utf8))
}

do {
  try main()
} catch {
  let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(1)
}
