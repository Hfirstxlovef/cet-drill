import Foundation
import Vision
import AppKit

// 用法：swift ocr.swift <pngDir>
// 对目录下所有 .png（按文件名排序）做 macOS Vision OCR，按页拼接打印文本。本机离线、免费。
let dir = CommandLine.arguments[1]
let fm = FileManager.default
let pngs = (try? fm.contentsOfDirectory(atPath: dir))?
  .filter { $0.hasSuffix(".png") }
  .sorted() ?? []

for name in pngs {
  let path = (dir as NSString).appendingPathComponent(name)
  guard let img = NSImage(contentsOfFile: path),
        let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = true
  req.recognitionLanguages = ["zh-Hans", "en-US"]
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  try? handler.perform([req])
  for obs in (req.results ?? []) {
    if let t = obs.topCandidates(1).first { print(t.string) }
  }
  print("")
}
