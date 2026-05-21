import Foundation
import Vision
import ImageIO

struct TextObservation: Codable {
    let image: String
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

func imageSize(url: URL) -> (Double, Double)? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = props[kCGImagePropertyPixelWidth] as? Double,
          let height = props[kCGImagePropertyPixelHeight] as? Double else {
        return nil
    }
    return (width, height)
}

let args = CommandLine.arguments.dropFirst()
if args.isEmpty {
    fputs("Usage: swift ocr.swift <image> [image...]\n", stderr)
    exit(2)
}

var all: [TextObservation] = []

for path in args {
    let url = URL(fileURLWithPath: path)
    let size = imageSize(url: url) ?? (1, 1)
    let request = VNRecognizeTextRequest { request, error in
        if let error = error {
            fputs("OCR failed for \(path): \(error)\n", stderr)
            return
        }
        guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
        for observation in observations {
            guard let candidate = observation.topCandidates(1).first else { continue }
            let box = observation.boundingBox
            all.append(TextObservation(
                image: url.lastPathComponent,
                text: candidate.string,
                confidence: candidate.confidence,
                x: Double(box.minX) * size.0,
                y: (1.0 - Double(box.maxY)) * size.1,
                width: Double(box.width) * size.0,
                height: Double(box.height) * size.1
            ))
        }
    }
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.002

    let handler = VNImageRequestHandler(url: url, options: [:])
    try handler.perform([request])
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
let data = try encoder.encode(all.sorted { lhs, rhs in
    if lhs.image != rhs.image { return lhs.image < rhs.image }
    if abs(lhs.y - rhs.y) > 4 { return lhs.y < rhs.y }
    return lhs.x < rhs.x
})
FileHandle.standardOutput.write(data)
