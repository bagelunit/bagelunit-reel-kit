// ocr.swift: text and bounding boxes in images, using Apple's Vision (no install). Prints one JSON object per image.
//   ./ocr a.png b.png   ->  {"file":"a.png","w":1080,"h":1920,"lines":[{"text":"...","x":..,"y":..,"w":..,"h":..,"conf":0.9}]}   (pixels, y from the top)
import Foundation
import Vision
import AppKit

for path in CommandLine.arguments.dropFirst() {
    guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
    let W = Double(cg.width), H = Double(cg.height)
    let req = VNRecognizeTextRequest(); req.recognitionLevel = .accurate; req.usesLanguageCorrection = false; req.minimumTextHeight = 0.008
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    var lines: [[String: Any]] = []
    for o in (req.results ?? []) {
        guard let c = o.topCandidates(1).first else { continue }
        let b = o.boundingBox
        lines.append(["text": c.string, "x": b.minX * W, "y": (1 - b.maxY) * H, "w": b.width * W, "h": b.height * H, "conf": Double(c.confidence)])
    }
    let out: [String: Any] = ["file": (path as NSString).lastPathComponent, "w": W, "h": H, "lines": lines]
    if let d = try? JSONSerialization.data(withJSONObject: out), let s = String(data: d, encoding: .utf8) { print(s) }
}
