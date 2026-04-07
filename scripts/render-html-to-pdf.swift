import Foundation
import WebKit
import PDFKit
import AppKit

final class NavigationDelegate: NSObject, WKNavigationDelegate {
  var onFinish: (() -> Void)?
  var onError: ((Error) -> Void)?

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    onFinish?()
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    onError?(error)
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    onError?(error)
  }
}

func waitOn(_ semaphore: DispatchSemaphore, timeoutSeconds: Double) -> Bool {
  let deadline = Date().addingTimeInterval(timeoutSeconds)
  while Date() < deadline {
    if semaphore.wait(timeout: .now()) == .success {
      return true
    }
    RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.05))
  }
  return false
}

let args = CommandLine.arguments
guard args.count >= 3 else {
  fputs("usage: swift render-html-to-pdf.swift <input.html> <output.pdf>\n", stderr)
  exit(2)
}

let htmlPath = args[1]
let outputPath = args[2]
let htmlUrl = URL(fileURLWithPath: htmlPath)
let outputUrl = URL(fileURLWithPath: outputPath)

let html: String
do {
  html = try String(contentsOf: htmlUrl, encoding: .utf8)
} catch {
  fputs("Unable to read HTML input: \(error)\n", stderr)
  exit(1)
}

let pageWidth: CGFloat = 794
let pageHeight: CGFloat = 1123

let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: pageWidth, height: pageHeight))
let delegate = NavigationDelegate()
webView.navigationDelegate = delegate

let loadSignal = DispatchSemaphore(value: 0)
var loadError: Error? = nil
delegate.onFinish = { loadSignal.signal() }
delegate.onError = { error in
  loadError = error
  loadSignal.signal()
}

webView.loadHTMLString(html, baseURL: htmlUrl.deletingLastPathComponent())
guard waitOn(loadSignal, timeoutSeconds: 25) else {
  fputs("Timed out while loading HTML content.\n", stderr)
  exit(1)
}

if let error = loadError {
  fputs("Failed to load HTML content: \(error)\n", stderr)
  exit(1)
}

Thread.sleep(forTimeInterval: 0.5)

let pdfSignal = DispatchSemaphore(value: 0)
var renderedPdfData: Data? = nil
var renderError: Error? = nil

webView.createPDF(configuration: WKPDFConfiguration()) { result in
  switch result {
  case .success(let data):
    renderedPdfData = data
  case .failure(let error):
    renderError = error
  }
  pdfSignal.signal()
}

guard waitOn(pdfSignal, timeoutSeconds: 25) else {
  fputs("Timed out while rendering PDF.\n", stderr)
  exit(1)
}

if let error = renderError {
  fputs("Failed to render PDF: \(error)\n", stderr)
  exit(1)
}

guard let longPdfData = renderedPdfData else {
  fputs("Renderer returned no PDF data.\n", stderr)
  exit(1)
}

let longPdfUrl = outputUrl.deletingLastPathComponent().appendingPathComponent("render_long.pdf")
do {
  try longPdfData.write(to: longPdfUrl)
} catch {
  fputs("Failed writing intermediate PDF: \(error)\n", stderr)
  exit(1)
}

defer {
  try? FileManager.default.removeItem(at: longPdfUrl)
}

guard let longDocument = PDFDocument(url: longPdfUrl), let sourcePage = longDocument.page(at: 0) else {
  do {
    try longPdfData.write(to: outputUrl)
    print(outputPath)
    exit(0)
  } catch {
    fputs("Failed writing output PDF: \(error)\n", stderr)
    exit(1)
  }
}

let sourceBounds = sourcePage.bounds(for: .mediaBox)
let totalHeight = sourceBounds.height
let totalWidth = sourceBounds.width
let rawRatio = totalHeight / pageHeight
let roundedRatio = round(rawRatio)
let pageCount: Int
if abs(rawRatio - roundedRatio) < 0.02 {
  pageCount = max(1, Int(roundedRatio))
} else {
  pageCount = max(1, Int(ceil(rawRatio)))
}

if pageCount <= 1 {
  do {
    try longPdfData.write(to: outputUrl)
    print(outputPath)
    exit(0)
  } catch {
    fputs("Failed writing output PDF: \(error)\n", stderr)
    exit(1)
  }
}

let outputDocument = PDFDocument()
for index in 0..<pageCount {
  guard let pageClone = sourcePage.copy() as? PDFPage else { continue }

  let yTop = totalHeight - CGFloat(index + 1) * pageHeight
  let originY = max(0, yTop)
  let segmentHeight = min(pageHeight, totalHeight - CGFloat(index) * pageHeight)
  if segmentHeight <= 0 { continue }

  let segmentBox = CGRect(x: 0, y: originY, width: totalWidth, height: segmentHeight)
  pageClone.setBounds(segmentBox, for: .mediaBox)
  pageClone.setBounds(segmentBox, for: .cropBox)
  outputDocument.insert(pageClone, at: outputDocument.pageCount)
}

if outputDocument.pageCount == 0 {
  do {
    try longPdfData.write(to: outputUrl)
    print(outputPath)
  } catch {
    fputs("Failed writing output PDF: \(error)\n", stderr)
    exit(1)
  }
} else if outputDocument.write(to: outputUrl) {
  print(outputPath)
} else {
  fputs("Failed writing paginated PDF output.\n", stderr)
  exit(1)
}
