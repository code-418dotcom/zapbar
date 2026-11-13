import Foundation

/// HEOS CLI message encoding: values escape exactly &, = and % (same rules as heos-core cli/message.ts and HeosCodec.kt).
enum HeosCodec {
  static func encode(_ v: String) -> String {
    v.replacingOccurrences(of: "%", with: "%25").replacingOccurrences(of: "&", with: "%26").replacingOccurrences(of: "=", with: "%3D")
  }

  static func decode(_ v: String) -> String {
    var out = ""
    var i = v.startIndex
    while i < v.endIndex {
      if v[i] == "%", let end = v.index(i, offsetBy: 3, limitedBy: v.endIndex) {
        switch v[i..<end].uppercased() {
        case "%26": out += "&"; i = end; continue
        case "%3D": out += "="; i = end; continue
        case "%25": out += "%"; i = end; continue
        default: break
        }
      }
      out.append(v[i])
      i = v.index(after: i)
    }
    return out
  }

  static func parse(_ message: String) -> [String: String] {
    var out: [String: String] = [:]
    for part in message.split(separator: "&") where !part.isEmpty {
      if let eq = part.firstIndex(of: "=") {
        out[decode(String(part[..<eq]))] = decode(String(part[part.index(after: eq)...]))
      } else {
        out[decode(String(part))] = ""
      }
    }
    return out
  }

  /// Ordered params, so the wire format is stable and testable.
  static func build(_ command: String, _ params: [(String, String)] = []) -> String {
    let q = params.map { "\($0.0)=\(encode($0.1))" }.joined(separator: "&")
    return "heos://\(command)\(q.isEmpty ? "" : "?\(q)")\r\n"
  }
}
