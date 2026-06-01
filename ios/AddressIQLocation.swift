import Foundation
import CoreLocation
import React

/**
 * Native iOS module for `@addressiq/react-native`.
 *
 * Signal-driven — never polled. Three OS sources:
 *
 *   1. `CLCircularRegion` monitoring for ENTER/EXIT transitions per
 *      registered geofence (`registerGeofence(...)`).
 *   2. `startMonitoringSignificantLocationChanges` as the low-power
 *      fallback while the app is suspended.
 *   3. `CLLocationManager` with `distanceFilter` set to
 *      `options.distanceFilterM` and `pausesLocationUpdatesAutomatically`
 *      enabled, so iOS pauses delivery when the device is stationary.
 *
 * Events:
 *   - `AddressIQLocationUpdate`     — distance-filtered position update
 *   - `AddressIQGeofenceTransition` — region ENTER/EXIT
 */
@objc(AddressIQLocation)
class AddressIQLocation: RCTEventEmitter, CLLocationManagerDelegate {

  private let manager = CLLocationManager()
  private var collecting = false
  private var hasListeners = false

  // Pending permission promises — resolved from
  // `locationManagerDidChangeAuthorization(_:)`.
  private var pendingFgResolve: RCTPromiseResolveBlock?
  private var pendingBgResolve: RCTPromiseResolveBlock?

  // One-shot foreground reader. Cleared in delegate callbacks.
  private var oneShotResolve: RCTPromiseResolveBlock?
  private var oneShotReject: RCTPromiseRejectBlock?

  override init() {
    super.init()
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.manager.delegate = self
      self.manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
      self.manager.distanceFilter = 50
      self.manager.pausesLocationUpdatesAutomatically = true
      self.manager.activityType = .other
    }
  }

  @objc override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! {
    return ["AddressIQLocationUpdate", "AddressIQGeofenceTransition"]
  }

  override func startObserving() { hasListeners = true }
  override func stopObserving()  { hasListeners = false }

  // ── Capability + permission ─────────────────────────────────────────

  @objc(getPlatformVersion)
  func getPlatformVersion() -> String {
    "ios-\(UIDevice.current.systemVersion)"
  }

  @objc(hasLocationPermission:rejecter:)
  func hasLocationPermission(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    let status = currentAuthStatus()
    resolve(status == .authorizedAlways || status == .authorizedWhenInUse)
  }

  @objc(hasBackgroundLocationPermission:rejecter:)
  func hasBackgroundLocationPermission(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(currentAuthStatus() == .authorizedAlways)
  }

  @objc(requestLocationPermission:rejecter:)
  func requestLocationPermission(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let status = currentAuthStatus()
    if status == .authorizedAlways || status == .authorizedWhenInUse {
      resolve(true); return
    }
    if status == .denied || status == .restricted {
      resolve(false); return
    }
    pendingFgResolve = resolve
    DispatchQueue.main.async { [weak self] in
      self?.manager.requestWhenInUseAuthorization()
    }
  }

  @objc(requestBackgroundLocationPermission:rejecter:)
  func requestBackgroundLocationPermission(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    if currentAuthStatus() == .authorizedAlways {
      resolve(true); return
    }
    pendingBgResolve = resolve
    DispatchQueue.main.async { [weak self] in
      self?.manager.requestAlwaysAuthorization()
    }
  }

  @objc(isMockLocationDetected:rejecter:)
  func isMockLocationDetected(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    // iOS does not expose a public mock-location flag at the capability
    // level. Per-reading hardening (App Attest, course/speed sanity)
    // ships in the canonical iOS SDK and a follow-up slice wires it here.
    resolve(false)
  }

  // ── Foreground reading ──────────────────────────────────────────────

  @objc(getCurrentLocation:resolver:rejecter:)
  func getCurrentLocation(highAccuracy: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let status = currentAuthStatus()
    guard status == .authorizedAlways || status == .authorizedWhenInUse else {
      reject("E_PERMISSION", "Location permission not granted", nil); return
    }
    oneShotResolve = resolve
    oneShotReject = reject
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.manager.desiredAccuracy = highAccuracy ? kCLLocationAccuracyBest : kCLLocationAccuracyHundredMeters
      self.manager.requestLocation()
    }
  }

  // ── Background collection ───────────────────────────────────────────

  @objc(startBackgroundLocation:resolver:rejecter:)
  func startBackgroundLocation(options: NSDictionary, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    let status = currentAuthStatus()
    guard status == .authorizedAlways || status == .authorizedWhenInUse else {
      reject("E_PERMISSION", "Location permission not granted", nil); return
    }
    if collecting { resolve(true); return }

    let distanceFilter = (options["distanceFilterM"] as? NSNumber)?.doubleValue ?? 50
    let accuracy = (options["accuracy"] as? String) ?? "balanced"

    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.manager.distanceFilter = distanceFilter
      self.manager.desiredAccuracy = self.resolveAccuracy(accuracy)
      self.manager.pausesLocationUpdatesAutomatically = true
      self.manager.activityType = .other
      if status == .authorizedAlways {
        self.manager.allowsBackgroundLocationUpdates = true
        self.manager.startMonitoringSignificantLocationChanges()
      }
      self.manager.startUpdatingLocation()
      self.collecting = true
    }
    resolve(true)
  }

  @objc(stopBackgroundLocation:rejecter:)
  func stopBackgroundLocation(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.manager.stopUpdatingLocation()
      self.manager.stopMonitoringSignificantLocationChanges()
      self.manager.allowsBackgroundLocationUpdates = false
      self.collecting = false
    }
    resolve(nil)
  }

  @objc(isBackgroundRunning:rejecter:)
  func isBackgroundRunning(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(collecting)
  }

  // ── Adaptive geofences ──────────────────────────────────────────────

  @objc(registerGeofence:resolver:rejecter:)
  func registerGeofence(options: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else {
      reject("E_GEOFENCE", "Region monitoring is not available on this device", nil); return
    }
    guard let identifier = options["identifier"] as? String,
          let lat = (options["lat"] as? NSNumber)?.doubleValue,
          let lon = (options["lon"] as? NSNumber)?.doubleValue,
          let radius = (options["radiusM"] as? NSNumber)?.doubleValue else {
      reject("E_ARGS", "identifier, lat, lon, radiusM are required", nil); return
    }
    // iOS caps individual region radius at the device's maximum
    // (typically 1-2km depending on hardware); the SDK never registers
    // more than 20 regions per app.
    let maxRadius = manager.maximumRegionMonitoringDistance
    let clampedRadius = min(radius, maxRadius)

    let region = CLCircularRegion(
      center: CLLocationCoordinate2D(latitude: lat, longitude: lon),
      radius: clampedRadius,
      identifier: identifier,
    )
    region.notifyOnEntry = true
    region.notifyOnExit = true

    DispatchQueue.main.async { [weak self] in
      self?.manager.startMonitoring(for: region)
    }
    resolve(true)
  }

  @objc(unregisterGeofence:resolver:rejecter:)
  func unregisterGeofence(identifier: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      for region in self.manager.monitoredRegions where region.identifier == identifier {
        self.manager.stopMonitoring(for: region)
      }
    }
    resolve(nil)
  }

  @objc(unregisterAllGeofences:rejecter:)
  func unregisterAllGeofences(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      for region in self.manager.monitoredRegions {
        self.manager.stopMonitoring(for: region)
      }
    }
    resolve(nil)
  }

  // ── RCTEventEmitter shim ────────────────────────────────────────────

  @objc(addListener:)
  override func addListener(_ eventName: String!) {
    super.addListener(eventName)
  }

  @objc(removeListeners:)
  override func removeListeners(_ count: Double) {
    super.removeListeners(count)
  }

  // ── CLLocationManagerDelegate ───────────────────────────────────────

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    if let resolve = oneShotResolve, let location = locations.last {
      resolve(serialize(location))
      oneShotResolve = nil
      oneShotReject = nil
      return
    }
    guard hasListeners else { return }
    for loc in locations {
      sendEvent(withName: "AddressIQLocationUpdate", body: serialize(loc))
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    if let reject = oneShotReject {
      reject("E_LOCATION_FAIL", error.localizedDescription, error)
      oneShotResolve = nil
      oneShotReject = nil
    }
    // Non-one-shot failures are transient — CL will retry on its own.
  }

  func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
    emitTransition(region: region, transition: "ENTER")
  }

  func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
    emitTransition(region: region, transition: "EXIT")
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = currentAuthStatus()
    if let resolve = pendingFgResolve {
      resolve(status == .authorizedAlways || status == .authorizedWhenInUse)
      pendingFgResolve = nil
    }
    if let resolve = pendingBgResolve {
      resolve(status == .authorizedAlways)
      pendingBgResolve = nil
    }
  }

  // ── Internal ────────────────────────────────────────────────────────

  private func emitTransition(region: CLRegion, transition: String) {
    guard hasListeners, let circular = region as? CLCircularRegion else { return }
    let payload: [String: Any] = [
      "identifier": circular.identifier,
      "transition": transition,
      "lat": circular.center.latitude,
      "lon": circular.center.longitude,
      "radiusM": circular.radius,
      "timestampMs": Int(Date().timeIntervalSince1970 * 1000),
    ]
    sendEvent(withName: "AddressIQGeofenceTransition", body: payload)
  }

  private func currentAuthStatus() -> CLAuthorizationStatus {
    if #available(iOS 14.0, *) {
      return manager.authorizationStatus
    }
    return CLLocationManager.authorizationStatus()
  }

  private func resolveAccuracy(_ name: String) -> CLLocationAccuracy {
    switch name {
    case "high":     return kCLLocationAccuracyBest
    case "low":      return kCLLocationAccuracyKilometer
    default:         return kCLLocationAccuracyHundredMeters
    }
  }

  private func serialize(_ loc: CLLocation) -> [String: Any?] {
    return [
      "lat": loc.coordinate.latitude,
      "lon": loc.coordinate.longitude,
      "accuracyM": loc.horizontalAccuracy,
      "altitudeM": loc.verticalAccuracy >= 0 ? loc.altitude : nil,
      "speedMps": loc.speed >= 0 ? loc.speed : nil,
      "headingDeg": loc.course >= 0 ? loc.course : nil,
      "timestampMs": Int(loc.timestamp.timeIntervalSince1970 * 1000),
      "isMock": false,
      "provider": "core-location",
      "eventType": "BACKGROUND_CHECK",
    ]
  }
}
