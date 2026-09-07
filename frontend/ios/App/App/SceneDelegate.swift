import UIKit
import Capacitor
import HealthKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = HealthHubBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/** Registers the local HealthKit bridge with Capacitor's web runtime. */
final class HealthHubBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthHubPlugin())
    }
}

/**
 * A foreground-only, read-only bridge to Apple Health.
 *
 * This plugin never writes to HealthKit, never starts a background delivery query, and never
 * uploads or persists health data. The web layer must obtain separate, explicit consent before
 * any locally returned reading is sent to an API.
 */
@objc(HealthHubPlugin)
final class HealthHubPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "HealthHubPlugin"
    let jsName = "HealthHub"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReadPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readVitals", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()
    private let defaultWindow: TimeInterval = 24 * 60 * 60
    private let maximumWindow: TimeInterval = 30 * 24 * 60 * 60
    private let defaultReadLimit = 50
    private let maximumReadLimit = 100

    @objc func getStatus(_ call: CAPPluginCall) {
        let available = HKHealthStore.isHealthDataAvailable()
        call.resolve([
            "platform": "ios",
            "provider": "apple_health",
            "available": available,
            "installed": available,
            "readOnly": true,
            "supportsBackgroundSync": false,
            "supportsHistoryAccess": false,
            "supportedMetrics": Self.supportedMetrics,
            // Apple intentionally does not expose per-type read grant/deny state. Do not infer it.
            "permissionState": "review_in_health",
        ])
    }

    @objc func requestReadPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is not available on this device.", "HEALTHKIT_UNAVAILABLE")
            return
        }

        let metrics = requestedMetrics(from: call)
        guard !metrics.isEmpty else {
            call.reject("Choose at least one supported health metric before connecting.", "METRICS_REQUIRED")
            return
        }

        let types = Set(metrics.compactMap { sampleType(for: $0) })
        guard !types.isEmpty else {
            call.reject("Choose at least one supported health metric before connecting.", "METRICS_REQUIRED")
            return
        }

        // An empty toShare set makes the request read-only at the system boundary.
        healthStore.requestAuthorization(toShare: Set<HKSampleType>(), read: types) { success, error in
            DispatchQueue.main.async {
                if let error {
                    call.reject("Apple Health permission could not be requested. Please try again.", "PERMISSION_REQUEST_FAILED", error)
                    return
                }

                // `success` means the authorization flow completed; it is not proof that every
                // read permission was granted. Apple deliberately withholds that distinction.
                call.resolve([
                    "platform": "ios",
                    "provider": "apple_health",
                    "available": true,
                    "readOnly": true,
                    "authorizationRequestCompleted": success,
                    "requestedMetrics": Self.bridgeMetricIDs(from: metrics),
                    "permissionState": "review_in_health",
                ])
            }
        }
    }

    @objc func readVitals(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is not available on this device.", "HEALTHKIT_UNAVAILABLE")
            return
        }

        let metrics = requestedMetrics(from: call)
        guard !metrics.isEmpty else {
            call.reject("Choose at least one supported health metric to review.", "METRICS_REQUIRED")
            return
        }

        let end: Date
        let start: Date
        do {
            end = try dateOption(call, primaryKey: "endDate", alternateKey: "end_date") ?? Date()
            start = try dateOption(call, primaryKey: "startDate", alternateKey: "start_date") ?? end.addingTimeInterval(-defaultWindow)
        } catch {
            call.reject("Use ISO-8601 timestamps with a timezone for the selected health-data window.", "INVALID_TIME_RANGE")
            return
        }

        let selectedWindow = end.timeIntervalSince(start)
        guard selectedWindow > 0 else {
            call.reject("The health-data window must end after it starts.", "INVALID_TIME_RANGE")
            return
        }
        guard selectedWindow <= maximumWindow else {
            call.reject("Choose a period of 30 days or less. Full-history access is not requested.", "TIME_RANGE_TOO_LARGE")
            return
        }

        let limit = max(1, min(maximumReadLimit, call.getInt("limit") ?? defaultReadLimit))
        let queries = metrics.compactMap { metric -> (metric: String, type: HKSampleType)? in
            guard let type = sampleType(for: metric) else { return nil }
            return (metric, type)
        }
        guard !queries.isEmpty else {
            call.reject("Choose at least one supported health metric to review.", "METRICS_REQUIRED")
            return
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let perQueryLimit = max(1, min(maximumReadLimit, Int(ceil(Double(limit) / Double(queries.count)))))
        let group = DispatchGroup()
        let lock = NSLock()
        var readings: [[String: Any]] = []

        for query in queries {
            group.enter()
            let sampleQuery = HKSampleQuery(
                sampleType: query.type,
                predicate: predicate,
                limit: perQueryLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
            ) { _, samples, error in
                defer { group.leave() }

                // A user can revoke a HealthKit read type at any point. Apple often returns an
                // empty set for unreadable types, which is intentionally treated as no data.
                guard error == nil, let samples else { return }
                let mapped = samples.compactMap { self.observation(from: $0, metric: query.metric) }
                guard !mapped.isEmpty else { return }

                lock.lock()
                readings.append(contentsOf: mapped)
                lock.unlock()
            }
            healthStore.execute(sampleQuery)
        }

        group.notify(queue: .main) {
            let sortedReadings = readings
                .sorted { ($0["observed_at"] as? String ?? "") > ($1["observed_at"] as? String ?? "") }
                .prefix(limit)
            call.resolve([
                "platform": "ios",
                "provider": "apple_health",
                "readOnly": true,
                "requestedMetrics": Self.bridgeMetricIDs(from: metrics),
                "readings": Array(sortedReadings),
            ])
        }
    }

    private func observation(from sample: HKSample, metric: String) -> [String: Any]? {
        let sourceRecordID = sample.uuid.uuidString
        let observedAt = ISO8601DateFormatter().string(from: sample.endDate)
        let base: [String: Any] = [
            "metric_type": metric,
            "unit": unit(for: metric),
            "observed_at": observedAt,
            "source": "health_store",
            "source_record_id": sourceRecordID,
        ]

        if metric == "sleep_duration" {
            guard let category = sample as? HKCategorySample,
                  let minutes = sleepMinutes(for: category) else { return nil }
            return base.merging(["value": minutes]) { _, latest in latest }
        }

        guard let quantitySample = sample as? HKQuantitySample,
              let value = quantityValue(quantitySample.quantity, metric: metric) else { return nil }
        return base.merging(["value": value]) { _, latest in latest }
    }

    private func quantityValue(_ quantity: HKQuantity, metric: String) -> Double? {
        switch metric {
        case "heart_rate", "resting_heart_rate":
            return quantity.doubleValue(for: HKUnit.count().unitDivided(by: HKUnit.minute()))
        case "spo2":
            // HealthKit stores saturation as a fraction. The Care OS/API contract uses 0–100.
            return quantity.doubleValue(for: HKUnit.percent()) * 100
        case "temperature":
            return quantity.doubleValue(for: HKUnit.degreeCelsius())
        case "systolic_bp", "diastolic_bp":
            return quantity.doubleValue(for: HKUnit.millimeterOfMercury())
        case "weight":
            return quantity.doubleValue(for: HKUnit.gramUnit(with: .kilo))
        case "steps":
            return quantity.doubleValue(for: HKUnit.count())
        default:
            return nil
        }
    }

    private func sleepMinutes(for sample: HKCategorySample) -> Double? {
        let isAsleep: Bool
        if #available(iOS 16.0, *) {
            let asleepValues: Set<Int> = [
                HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                HKCategoryValueSleepAnalysis.asleepREM.rawValue,
            ]
            isAsleep = asleepValues.contains(sample.value)
        } else {
            isAsleep = sample.value == HKCategoryValueSleepAnalysis.asleep.rawValue
        }
        guard isAsleep else { return nil }
        return sample.endDate.timeIntervalSince(sample.startDate) / 60
    }

    private func requestedMetrics(from call: CAPPluginCall) -> [String] {
        guard let values = call.getArray("metrics", String.self) else { return [] }
        var metrics: [String] = []
        for value in values {
            guard let metric = canonicalMetric(value) else { continue }
            if metric == "blood_pressure" {
                appendUnique("systolic_bp", to: &metrics)
                appendUnique("diastolic_bp", to: &metrics)
            } else {
                appendUnique(metric, to: &metrics)
            }
        }
        return metrics
    }

    private func canonicalMetric(_ rawValue: String) -> String? {
        let value = rawValue
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "-", with: "_")
            .replacingOccurrences(of: " ", with: "_")
        switch value {
        case "heart_rate", "heartrate": return "heart_rate"
        case "resting_heart_rate", "restingheartrate": return "resting_heart_rate"
        case "spo2", "oxygen_saturation", "oxygensaturation": return "spo2"
        case "systolic_bp", "systolic": return "systolic_bp"
        case "diastolic_bp", "diastolic": return "diastolic_bp"
        case "blood_pressure", "bloodpressure": return "blood_pressure"
        case "temperature", "body_temperature", "bodytemperature": return "temperature"
        case "weight": return "weight"
        case "steps": return "steps"
        case "sleep_duration", "sleep": return "sleep_duration"
        default: return nil
        }
    }

    private func sampleType(for metric: String) -> HKSampleType? {
        switch metric {
        case "heart_rate": return HKQuantityType.quantityType(forIdentifier: .heartRate)
        case "resting_heart_rate": return HKQuantityType.quantityType(forIdentifier: .restingHeartRate)
        case "spo2": return HKQuantityType.quantityType(forIdentifier: .oxygenSaturation)
        case "temperature": return HKQuantityType.quantityType(forIdentifier: .bodyTemperature)
        case "systolic_bp": return HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic)
        case "diastolic_bp": return HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic)
        case "weight": return HKQuantityType.quantityType(forIdentifier: .bodyMass)
        case "steps": return HKQuantityType.quantityType(forIdentifier: .stepCount)
        case "sleep_duration": return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        default: return nil
        }
    }

    private func unit(for metric: String) -> String {
        switch metric {
        case "heart_rate", "resting_heart_rate": return "bpm"
        case "spo2": return "percent"
        case "temperature": return "celsius"
        case "systolic_bp", "diastolic_bp": return "mmHg"
        case "weight": return "kg"
        case "steps": return "count"
        case "sleep_duration": return "minutes"
        default: return ""
        }
    }

    private func dateOption(
        _ call: CAPPluginCall,
        primaryKey: String,
        alternateKey: String
    ) throws -> Date? {
        let rawValue = call.getString(primaryKey) ?? call.getString(alternateKey)
        guard let rawValue, !rawValue.isEmpty else { return nil }
        guard let date = ISO8601DateFormatter().date(from: rawValue) else {
            throw HealthHubError.invalidDate
        }
        return date
    }

    private func appendUnique(_ metric: String, to metrics: inout [String]) {
        if !metrics.contains(metric) { metrics.append(metric) }
    }

    private static let supportedCanonicalMetrics = [
        "heart_rate",
        "resting_heart_rate",
        "spo2",
        "temperature",
        "systolic_bp",
        "diastolic_bp",
        "weight",
        "steps",
        "sleep_duration",
    ]

    private static let supportedMetrics = bridgeMetricIDs(from: supportedCanonicalMetrics)

    private static func bridgeMetricIDs(from canonicalMetrics: [String]) -> [String] {
        var ids: [String] = []
        for metric in canonicalMetrics {
            let id: String
            switch metric {
            case "heart_rate": id = "heartRate"
            case "resting_heart_rate": id = "restingHeartRate"
            case "spo2": id = "oxygenSaturation"
            case "systolic_bp", "diastolic_bp": id = "bloodPressure"
            case "temperature": id = "bodyTemperature"
            case "sleep_duration": id = "sleep"
            default: id = metric
            }
            if !ids.contains(id) { ids.append(id) }
        }
        return ids
    }

    private enum HealthHubError: Error {
        case invalidDate
    }
}
