import Foundation
import ImageIO
import Vision

struct TextLine: Encodable {
    let text: String
    let confidence: Float
    let bounds: TextBounds
}
struct TextBounds: Encodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}
struct OCRResult: Encodable {
    let engine: String
    let text: String
    let lines: [TextLine]
    let recognition_ms: Int
    let width: Int
    let height: Int
}

func fail(_ message: String) -> NSError {
    NSError(domain: "ClefStudioOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

do {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard !data.isEmpty, data.count <= 4 * 1024 * 1024 else { throw fail("Provide an image under 4 MiB.") }
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int else { throw fail("Could not decode the image.") }
    guard width > 0, height > 0, width * height <= 16_000_000 else { throw fail("Image exceeds 16 megapixels.") }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = true
    let started = Date()
    try VNImageRequestHandler(data: data, options: [:]).perform([request])
    let observations = (request.results ?? []).sorted {
        if $0.boundingBox.midY == $1.boundingBox.midY { return $0.boundingBox.minX < $1.boundingBox.minX }
        return $0.boundingBox.midY > $1.boundingBox.midY
    }
    let lines = observations.compactMap { observation -> TextLine? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return TextLine(text: candidate.string, confidence: candidate.confidence,
                        bounds: TextBounds(x: box.minX, y: 1 - box.maxY, width: box.width, height: box.height))
    }
    let result = OCRResult(engine: "Apple Vision", text: lines.map(\.text).joined(separator: "\n"), lines: lines,
                           recognition_ms: Int(Date().timeIntervalSince(started) * 1000), width: width, height: height)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    FileHandle.standardOutput.write(try encoder.encode(result))
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
