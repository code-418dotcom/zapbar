import ExpoModulesCore
import Network
import dnssd

public class ZapbarDiscoveryModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZapbarDiscovery")

    // Browses Bonjour for serviceType and resolves the IPv4 address of each result.
    // Rejects with LOCAL_NETWORK_DENIED when iOS still blocks local network access at the deadline.
    AsyncFunction("browseAsync") { (serviceType: String, timeoutMs: Int, promise: Promise) in
      BonjourBrowse(serviceType: serviceType, timeoutMs: timeoutMs, promise: promise).start()
    }
  }
}

/// One browse. Every handler runs on `queue`, so state needs no locks. The handlers hold the
/// session strongly until `finish` clears them, which keeps it alive for exactly one browse.
private final class BonjourBrowse {
  private static let settleMs = 750

  private let queue = DispatchQueue(label: "app.zapbar.discovery.browse")
  private let browser: NWBrowser
  private let timeoutMs: Int
  private let promise: Promise
  private var seen = Set<NWEndpoint>()
  private var connections: [NWConnection] = []
  private var ips: [String] = []
  private var policyDenied = false
  private var done = false

  init(serviceType: String, timeoutMs: Int, promise: Promise) {
    self.browser = NWBrowser(for: .bonjour(type: serviceType, domain: "local."), using: .tcp)
    self.timeoutMs = max(0, timeoutMs)
    self.promise = promise
  }

  func start() {
    browser.stateUpdateHandler = { [self] state in
      switch state {
      case .waiting(let error):
        if case .dns(let code) = error, code == DNSServiceErrorType(kDNSServiceErr_PolicyDenied) {
          policyDenied = true
        }
      case .ready:
        policyDenied = false // the user tapped Allow; keep browsing
      case .failed(let error):
        var denied = false
        if case .dns(let code) = error, code == DNSServiceErrorType(kDNSServiceErr_PolicyDenied) {
          denied = true
        }
        finish(denied: denied && ips.isEmpty)
      default:
        break
      }
    }
    browser.browseResultsChangedHandler = { [self] results, _ in
      for result in results where !seen.contains(result.endpoint) {
        seen.insert(result.endpoint)
        connect(to: result.endpoint)
      }
    }
    browser.start(queue: queue)
    queue.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) { [self] in
      finish(denied: policyDenied && ips.isEmpty)
    }
  }

  /// Bonjour hands out service endpoints, not addresses: connecting resolves one to an address.
  private func connect(to endpoint: NWEndpoint) {
    guard !done else { return }
    let params = NWParameters.tcp
    if let ip = params.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
      ip.version = .v4
    }
    let connection = NWConnection(to: endpoint, using: params)
    connections.append(connection)
    connection.stateUpdateHandler = { [self, weak connection] state in
      switch state {
      case .ready:
        if let remote = connection?.currentPath?.remoteEndpoint,
           case .hostPort(let host, _) = remote,
           case .ipv4(let address) = host {
          collect(ipv4String(address))
        }
        connection?.cancel()
      case .failed:
        connection?.cancel()
      default:
        break
      }
    }
    connection.start(queue: queue)
  }

  private func ipv4String(_ address: IPv4Address) -> String {
    let text = "\(address)"
    return text.split(separator: "%", maxSplits: 1).first.map(String.init) ?? text
  }

  private func collect(_ ip: String) {
    guard !done, !ips.contains(ip) else { return }
    ips.append(ip)
    if ips.count == 1 {
      queue.asyncAfter(deadline: .now() + .milliseconds(Self.settleMs)) { [self] in
        finish(denied: false)
      }
    }
  }

  private func finish(denied: Bool) {
    guard !done else { return }
    done = true
    browser.stateUpdateHandler = nil
    browser.browseResultsChangedHandler = nil
    browser.cancel()
    for connection in connections {
      connection.stateUpdateHandler = nil
      connection.cancel()
    }
    connections.removeAll()
    if denied {
      promise.reject("LOCAL_NETWORK_DENIED", "Local network access denied")
    } else {
      promise.resolve(ips)
    }
  }
}
