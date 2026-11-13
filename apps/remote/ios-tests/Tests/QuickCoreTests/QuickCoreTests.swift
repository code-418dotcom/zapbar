import XCTest
@testable import QuickCore

/// Ports of the Kotlin tests (QuickActionsTest, QuickStoreTest, PillTest), same values.
final class QuickCoreTests: XCTestCase {
  let json = """
  {"key":"TESTSERIAL0001","serial":"TESTSERIAL0001","lastIp":"10.0.0.82","name":"Loving room",
   "inputs":[{"mid":"inputs/hdmi_in_1","label":"PS5","icon":"playstation","hidden":false},{"mid":"inputs/aux_in_1","label":"AUX","icon":"audio","hidden":true}],
   "volumeKeys":true,"notification":false}
  """
  let config = QuickConfig(key: "K", serial: "K", lastIp: "10.0.0.82", name: "Loving room",
                           inputs: [QuickInput(mid: "inputs/hdmi_in_1", label: "PS5", icon: "playstation", hidden: false)],
                           volumeKeys: true, notification: true, volumeCap: 100)

  final class MemBackend: QuickBackend, @unchecked Sendable {
    var cfg: QuickConfig?
    var st = QuickState()
    init(_ cfg: QuickConfig?) { self.cfg = cfg }
    func config() -> QuickConfig? { cfg }
    func state() -> QuickState { st }
    func saveState(_ s: QuickState) { st = s }
  }

  final class FakeBar: HeosQuickLike, @unchecked Sendable {
    var volume = 30, mute = false, mid = "inputs/hdmi_in_2", reads = 0
    var log: [String] = []
    var failSet = false
    func pidFor(_ serial: String) async throws -> Int { 1 }
    func volume(_ pid: Int) async throws -> Int { reads += 1; return volume }
    func setVolume(_ pid: Int, _ v: Int) async throws {
      if failSet { throw QuickError.heos("timed out") }
      log.append("vol \(v)"); try await Task.sleep(nanoseconds: 20_000_000); volume = v
    }
    func mute(_ pid: Int) async throws -> Bool { mute }
    func setMute(_ pid: Int, _ on: Bool) async throws { log.append("mute \(on)"); mute = on }
    func playInput(_ pid: Int, _ mid: String) async throws { log.append("input \(mid)"); self.mid = mid }
    func nowPlayingMid(_ pid: Int) async throws -> String? { mid }
    func playState(_ pid: Int) async throws -> String { "play" }
    func close() {}
  }

  func actions(_ be: QuickBackend, _ bar: FakeBar) -> QuickActions { QuickActions(backend: be) { _ in bar } }

  // MARK: codec

  func testCodecRoundTripsAmpEqualsPercent() {
    XCTAssertEqual(HeosCodec.encode("a&b=c%d"), "a%26b%3Dc%25d")
    XCTAssertEqual(HeosCodec.decode(HeosCodec.encode("a&b=c%d")), "a&b=c%d")
    XCTAssertEqual(HeosCodec.parse("pid=1&level=30"), ["pid": "1", "level": "30"])
    XCTAssertEqual(HeosCodec.build("player/set_volume", [("pid", "1"), ("level", "45")]), "heos://player/set_volume?pid=1&level=45\r\n")
    XCTAssertEqual(HeosCodec.build("player/get_players"), "heos://player/get_players\r\n")
  }

  // MARK: config & state

  func testConfigJsonFromJsDecodes() throws {
    let c = try XCTUnwrap(QuickConfig.decode(json))
    XCTAssertEqual(c.name, "Loving room")
    XCTAssertEqual(c.inputs.count, 2)
    XCTAssertEqual(c.inputs[0].icon, "playstation")
    XCTAssertFalse(c.notification)
  }

  func testConfigWithoutVolumeCapDefaultsTo100() {
    XCTAssertEqual(QuickConfig.decode(json)?.volumeCap, 100)
  }

  func testGarbageConfigIsNil() {
    XCTAssertNil(QuickConfig.decode("{not json"))
    XCTAssertNil(QuickConfig.decode(nil))
  }

  func testCapNeverRaisesAVolumeAlreadyAboveIt() {
    var c = QuickConfig.decode(json)!
    c.volumeCap = 30
    XCTAssertEqual(c.capped(55, current: 50), 50)
    XCTAssertEqual(c.capped(40, current: 20), 30)
    XCTAssertEqual(c.capped(10, current: 50), 10)
    XCTAssertEqual(QuickConfig.decode(json)!.capped(77, current: 10), 77)
  }

  func testVisibleInputsSkipsHiddenAndKeepsOrder() {
    XCTAssertEqual(QuickConfig.decode(json)!.visibleInputs().map(\.mid), ["inputs/hdmi_in_1"])
  }

  func testStateRoundTripsAndDefaults() {
    let s = QuickState(volume: 42, mute: true, activeMid: "inputs/hdmi_in_1", playState: "play")
    XCTAssertEqual(QuickState.decode(s.encoded()), s)
    XCTAssertEqual(QuickState.decode(nil), QuickState())
    // What the app's setState sends: no message fields.
    XCTAssertEqual(QuickState.decode(#"{"volume":12,"mute":false,"activeMid":null,"playState":"stop"}"#).volume, 12)
  }

  // MARK: pill & status

  func testSegmentVolumes() {
    XCTAssertEqual(Pill.volumeFor(0), 5); XCTAssertEqual(Pill.volumeFor(9), 50); XCTAssertEqual(Pill.volumeFor(19), 100)
    XCTAssertEqual(Pill.step, Pill.volumeFor(1) - Pill.volumeFor(0))  // − / + move exactly one segment
  }

  func testFilledSegments() {
    XCTAssertEqual(Pill.filled(0), 0); XCTAssertEqual(Pill.filled(2), 0); XCTAssertEqual(Pill.filled(3), 1)
    XCTAssertEqual(Pill.filled(42), 8); XCTAssertEqual(Pill.filled(100), 20); XCTAssertEqual(Pill.filled(150), 20); XCTAssertEqual(Pill.filled(-5), 0)
  }

  func testStatusShowsActiveInputLabel() {
    XCTAssertEqual(status(nil, QuickState(), now: 0), "Open Zapbar to set up")
    XCTAssertEqual(status(config, QuickState(activeMid: "inputs/hdmi_in_1"), now: 0), "PS5")
    XCTAssertEqual(status(config, QuickState(activeMid: "inputs/hdmi_in_1", message: "Soundbar didn't respond", messageUntil: 1000), now: 500), "Soundbar didn't respond")
    XCTAssertEqual(status(config, QuickState(activeMid: "inputs/hdmi_in_1", message: "x", messageUntil: 1000), now: 1500), "PS5")
  }

  // MARK: actions

  func testSetVolumeAtOrUnderTheCapDoesNotReadFirst() async {
    let bar = FakeBar()
    _ = await actions(MemBackend(config), bar).run(.setVolume(45))
    XCTAssertEqual(bar.reads, 1) // only the read-back
  }

  func testSegmentTapIsCapped() async {
    var capped = config; capped.volumeCap = 30
    let bar = FakeBar()
    let s = await actions(MemBackend(capped), bar).run(.setVolume(100))
    XCTAssertEqual(s.volume, 30)
    XCTAssertEqual(bar.reads, 2)
  }

  func testSetVolumeThenReadsBackState() async {
    let be = MemBackend(config)
    let s = await actions(be, FakeBar()).run(.setVolume(45))
    XCTAssertEqual(s.volume, 45); XCTAssertEqual(s.activeMid, "inputs/hdmi_in_2"); XCTAssertEqual(be.st, s)
  }

  func testStepAddsDeltaToCurrentVolumeAndClamps() async {
    let bar = FakeBar(); bar.volume = 98
    let up = await actions(MemBackend(config), bar).run(.step(5))
    XCTAssertEqual(up.volume, 100)
    bar.volume = 3
    let down = await actions(MemBackend(config), bar).run(.step(-5))
    XCTAssertEqual(down.volume, 0)
    var capped = config; capped.volumeCap = 30
    bar.volume = 28
    let stop = await actions(MemBackend(capped), bar).run(.step(5))
    XCTAssertEqual(stop.volume, 30)
  }

  func testToggleMuteAndPlayInput() async {
    let bar = FakeBar(); bar.mute = true
    let m = await actions(MemBackend(config), bar).run(.toggleMute)
    XCTAssertFalse(m.mute)
    let i = await actions(MemBackend(config), bar).run(.playInput("inputs/hdmi_in_1"))
    XCTAssertEqual(i.activeMid, "inputs/hdmi_in_1")
  }

  func testNoConfigGivesSetUpMessage() async {
    let s = await actions(MemBackend(nil), FakeBar()).run(.refresh)
    XCTAssertEqual(s.message, "Open Zapbar to set up")
  }

  func testUnreachableBarGivesReconnectMessage() async {
    let s = await QuickActions(backend: MemBackend(config)) { _ in throw QuickError.unreachable }.run(.setVolume(10))
    XCTAssertEqual(s.message, "Open Zapbar to reconnect")
  }

  func testSilentBarReportsItDidNotRespond() async {
    let bar = FakeBar(); bar.failSet = true
    let s = await actions(MemBackend(config), bar).run(.setVolume(10))
    XCTAssertEqual(s.message, "Soundbar didn't respond")
  }

  func testFailureRestoresTheStateBeforeTheOptimisticPaint() async {
    let be = MemBackend(config)
    be.st = QuickState(volume: 30, activeMid: "inputs/hdmi_in_2")
    let before = be.st
    be.st.volume = 80 // optimistic paint
    let s = await QuickActions(backend: be) { _ in throw QuickError.unreachable }.run(.setVolume(80), before: before)
    XCTAssertEqual(s.volume, 30); XCTAssertEqual(s.message, "Open Zapbar to reconnect"); XCTAssertEqual(be.st.volume, 30)
  }

  func testActionsAreSerialisedAndTheLastReadBackWins() async {
    let bar = FakeBar(); let be = MemBackend(config)
    await withTaskGroup(of: Void.self) { g in
      for v in [10, 20, 30, 40] { g.addTask { _ = await self.actions(be, bar).run(.setVolume(v)) } }
    }
    XCTAssertEqual(bar.log.count, 4)
    XCTAssertEqual(be.st.volume, bar.volume)
  }
}

/// Read-only check of the real client against a real bar: ZAPBAR_LIVE_IP=10.0.0.82 swift test. Skipped otherwise.
final class HeosClientLiveTests: XCTestCase {
  func testReadsStateFromARealBar() async throws {
    guard let ip = ProcessInfo.processInfo.environment["ZAPBAR_LIVE_IP"] else { throw XCTSkip("set ZAPBAR_LIVE_IP") }
    let bar = try await HeosClient.connect(ip)
    defer { bar.close() }
    let pid = try await bar.pidFor("")
    let v = try await bar.volume(pid)
    XCTAssert((0...100).contains(v))
    _ = try await bar.mute(pid)
    _ = try await bar.nowPlayingMid(pid)
  }

  func testUnreachableIpThrowsUnreachableWithinTheTimeout() async {
    guard ProcessInfo.processInfo.environment["ZAPBAR_LIVE_IP"] != nil else { return }
    let start = Date()
    do { _ = try await HeosClient.connect("10.0.0.254"); XCTFail("connected") } catch { XCTAssertEqual(error as? QuickError, .unreachable) }
    XCTAssertLessThan(Date().timeIntervalSince(start), 4)
  }
}
