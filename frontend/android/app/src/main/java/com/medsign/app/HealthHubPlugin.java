package com.medsign.app;

import androidx.activity.result.ActivityResultLauncher;
import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.PermissionController;
import androidx.health.connect.client.records.BloodPressureRecord;
import androidx.health.connect.client.records.BodyTemperatureRecord;
import androidx.health.connect.client.records.HeartRateRecord;
import androidx.health.connect.client.records.OxygenSaturationRecord;
import androidx.health.connect.client.records.Record;
import androidx.health.connect.client.records.RestingHeartRateRecord;
import androidx.health.connect.client.records.SleepSessionRecord;
import androidx.health.connect.client.records.StepsRecord;
import androidx.health.connect.client.records.WeightRecord;
import androidx.health.connect.client.request.ReadRecordsRequest;
import androidx.health.connect.client.response.ReadRecordsResponse;
import androidx.health.connect.client.time.TimeRangeFilter;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import kotlin.ResultKt;
import kotlin.coroutines.Continuation;
import kotlin.coroutines.CoroutineContext;
import kotlin.coroutines.EmptyCoroutineContext;
import kotlin.coroutines.intrinsics.IntrinsicsKt;
import kotlin.jvm.internal.Reflection;
import kotlin.reflect.KClass;

/**
 * A deliberately small, on-device Health Connect bridge.
 *
 * It exposes only foreground, user-initiated, read-only operations. The plugin does not persist,
 * upload, or schedule health-data work. The web layer must obtain separate user confirmation
 * before it sends any returned observation to an API.
 */
@CapacitorPlugin(name = "HealthHub")
public class HealthHubPlugin extends Plugin {
    private static final int DEFAULT_READ_LIMIT = 50;
    private static final int MAX_READ_LIMIT = 100;
    private static final Duration DEFAULT_WINDOW = Duration.ofHours(24);
    private static final Duration MAX_WINDOW = Duration.ofDays(30);

    private ActivityResultLauncher<Set<String>> permissionLauncher;
    private PluginCall pendingPermissionCall;
    private List<String> pendingCanonicalMetrics = Collections.emptyList();
    private List<String> pendingRequestedMetrics = Collections.emptyList();

    @Override
    public void load() {
        permissionLauncher = getBridge().registerForActivityResult(
            PermissionController.createRequestPermissionResultContract(),
            this::onHealthPermissionResult
        );
    }

    /** Returns provider availability. It never reads data or prompts the user. */
    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(statusResponse(HealthConnectClient.getSdkStatus(getContext())));
    }

    /**
     * Shows Health Connect's system permission UI for the exact metrics requested by the caller.
     * No default metric set is used, so a caller cannot accidentally request broad access.
     */
    @PluginMethod
    public void requestReadPermissions(PluginCall call) {
        List<String> metrics = normalizedMetrics(call);
        if (metrics.isEmpty()) {
            call.reject("Choose at least one supported health metric before connecting.", "METRICS_REQUIRED");
            return;
        }

        int sdkStatus = HealthConnectClient.getSdkStatus(getContext());
        if (sdkStatus != HealthConnectClient.SDK_AVAILABLE) {
            call.reject(
                "Health Connect is not available on this device.",
                "HEALTH_CONNECT_UNAVAILABLE",
                statusResponse(sdkStatus)
            );
            return;
        }

        if (pendingPermissionCall != null) {
            call.reject("A Health Connect permission request is already open.", "PERMISSION_REQUEST_IN_PROGRESS");
            return;
        }

        Set<String> permissions = new HashSet<>();
        for (String metric : metrics) {
            permissions.add(permissionFor(metric));
        }

        pendingPermissionCall = call;
        pendingCanonicalMetrics = metrics;
        pendingRequestedMetrics = bridgeMetricIds(metrics);
        permissionLauncher.launch(permissions);
    }

    /**
     * Reads a small, explicit time window after Health Connect permission has been granted.
     * Returned values stay in memory and are formatted as backend-ready observations; this class
     * intentionally performs no network request.
     */
    @PluginMethod
    public void readVitals(PluginCall call) {
        List<String> metrics = normalizedMetrics(call);
        if (metrics.isEmpty()) {
            call.reject("Choose at least one supported health metric to review.", "METRICS_REQUIRED");
            return;
        }

        int sdkStatus = HealthConnectClient.getSdkStatus(getContext());
        if (sdkStatus != HealthConnectClient.SDK_AVAILABLE) {
            call.reject(
                "Health Connect is not available on this device.",
                "HEALTH_CONNECT_UNAVAILABLE",
                statusResponse(sdkStatus)
            );
            return;
        }

        final Instant end;
        final Instant start;
        try {
            end = optionInstant(call, "endDate", "end_date", Instant.now());
            start = optionInstant(call, "startDate", "start_date", end.minus(DEFAULT_WINDOW));
        } catch (IllegalArgumentException error) {
            call.reject("Use ISO-8601 timestamps with a timezone for the selected health-data window.", "INVALID_TIME_RANGE");
            return;
        }

        if (!start.isBefore(end)) {
            call.reject("The health-data window must end after it starts.", "INVALID_TIME_RANGE");
            return;
        }
        if (Duration.between(start, end).compareTo(MAX_WINDOW) > 0) {
            call.reject("Choose a period of 30 days or less. Full-history access is not requested.", "TIME_RANGE_TOO_LARGE");
            return;
        }

        Integer providedLimit = call.getInt("limit", DEFAULT_READ_LIMIT);
        final int limit = Math.max(1, Math.min(MAX_READ_LIMIT, providedLimit == null ? DEFAULT_READ_LIMIT : providedLimit));
        final List<MetricQuery> queries = metricQueries(metrics);
        final JSArray readings = new JSArray();

        getBridge().execute(() -> {
            try {
                HealthConnectClient client = HealthConnectClient.getOrCreate(getContext());
                int perQueryLimit = Math.max(1, Math.min(MAX_READ_LIMIT, (int) Math.ceil((double) limit / queries.size())));
                readNext(client, queries, 0, metrics, TimeRangeFilter.between(start, end), perQueryLimit, limit, readings, call);
            } catch (Throwable error) {
                rejectRead(call, error);
            }
        });
    }

    private void onHealthPermissionResult(Set<String> grantedPermissions) {
        PluginCall call = pendingPermissionCall;
        List<String> canonicalMetrics = pendingCanonicalMetrics;
        List<String> requestedMetrics = pendingRequestedMetrics;
        pendingPermissionCall = null;
        pendingCanonicalMetrics = Collections.emptyList();
        pendingRequestedMetrics = Collections.emptyList();

        if (call == null) {
            return;
        }

        JSArray grantedMetrics = new JSArray();
        for (String metric : canonicalMetrics) {
            if (grantedPermissions.contains(permissionFor(metric))) {
                addIfAbsent(grantedMetrics, bridgeMetricId(metric));
            }
        }

        JSObject result = statusResponse(HealthConnectClient.SDK_AVAILABLE);
        result.put("authorizationRequestCompleted", true);
        result.put("requestedMetrics", stringArray(requestedMetrics));
        result.put("grantedMetrics", grantedMetrics);
        result.put("permissionState", grantedMetrics.length() == 0 ? "denied" : grantedMetrics.length() == requestedMetrics.size() ? "granted" : "partial");
        call.resolve(result);
    }

    @SuppressWarnings({ "rawtypes", "unchecked" })
    private void readNext(
        HealthConnectClient client,
        List<MetricQuery> queries,
        int index,
        List<String> requestedMetrics,
        TimeRangeFilter timeRange,
        int perQueryLimit,
        int overallLimit,
        JSArray readings,
        PluginCall call
    ) {
        if (index >= queries.size() || readings.length() >= overallLimit) {
            resolveRead(call, requestedMetrics, readings);
            return;
        }

        MetricQuery query = queries.get(index);
        KClass recordType = Reflection.getOrCreateKotlinClass(query.recordClass);
        ReadRecordsRequest request = new ReadRecordsRequest(
            recordType,
            timeRange,
            Collections.emptySet(),
            false,
            perQueryLimit,
            null
        );

        AtomicBoolean completed = new AtomicBoolean(false);
        Continuation continuation = new Continuation<ReadRecordsResponse>() {
            @Override
            public CoroutineContext getContext() {
                return EmptyCoroutineContext.INSTANCE;
            }

            @Override
            public void resumeWith(Object result) {
                if (!completed.compareAndSet(false, true)) {
                    return;
                }
                try {
                    ResultKt.throwOnFailure(result);
                    ReadRecordsResponse<?> response = (ReadRecordsResponse<?>) result;
                    appendReadings(query, response.getRecords(), requestedMetrics, readings, overallLimit);
                    readNext(client, queries, index + 1, requestedMetrics, timeRange, perQueryLimit, overallLimit, readings, call);
                } catch (Throwable error) {
                    rejectRead(call, error);
                }
            }
        };

        try {
            Object immediateResult = client.readRecords(request, continuation);
            if (immediateResult != IntrinsicsKt.getCOROUTINE_SUSPENDED()) {
                continuation.resumeWith(immediateResult);
            }
        } catch (Throwable error) {
            rejectRead(call, error);
        }
    }

    private void appendReadings(
        MetricQuery query,
        List<?> records,
        List<String> requestedMetrics,
        JSArray readings,
        int overallLimit
    ) {
        Set<String> requested = new HashSet<>(requestedMetrics);
        for (Object item : records) {
            if (readings.length() >= overallLimit || !(item instanceof Record)) {
                return;
            }

            Record record = (Record) item;
            String recordId = record.getMetadata().getId();

            if (query.kind.equals("heart_rate") && record instanceof HeartRateRecord) {
                for (HeartRateRecord.Sample sample : ((HeartRateRecord) record).getSamples()) {
                    addObservation(readings, "heart_rate", sample.getBeatsPerMinute(), "bpm", sample.getTime(), recordId, overallLimit);
                }
            } else if (query.kind.equals("resting_heart_rate") && record instanceof RestingHeartRateRecord) {
                RestingHeartRateRecord value = (RestingHeartRateRecord) record;
                addObservation(readings, "resting_heart_rate", value.getBeatsPerMinute(), "bpm", value.getTime(), recordId, overallLimit);
            } else if (query.kind.equals("spo2") && record instanceof OxygenSaturationRecord) {
                OxygenSaturationRecord value = (OxygenSaturationRecord) record;
                addObservation(readings, "spo2", value.getPercentage().getValue(), "percent", value.getTime(), recordId, overallLimit);
            } else if (query.kind.equals("blood_pressure") && record instanceof BloodPressureRecord) {
                BloodPressureRecord value = (BloodPressureRecord) record;
                if (requested.contains("systolic_bp")) {
                    addObservation(readings, "systolic_bp", value.getSystolic().getMillimetersOfMercury(), "mmHg", value.getTime(), recordId, overallLimit);
                }
                if (requested.contains("diastolic_bp")) {
                    addObservation(readings, "diastolic_bp", value.getDiastolic().getMillimetersOfMercury(), "mmHg", value.getTime(), recordId, overallLimit);
                }
            } else if (query.kind.equals("temperature") && record instanceof BodyTemperatureRecord) {
                BodyTemperatureRecord value = (BodyTemperatureRecord) record;
                addObservation(readings, "temperature", value.getTemperature().getCelsius(), "celsius", value.getTime(), recordId, overallLimit);
            } else if (query.kind.equals("weight") && record instanceof WeightRecord) {
                WeightRecord value = (WeightRecord) record;
                addObservation(readings, "weight", value.getWeight().getKilograms(), "kg", value.getTime(), recordId, overallLimit);
            } else if (query.kind.equals("steps") && record instanceof StepsRecord) {
                StepsRecord value = (StepsRecord) record;
                addObservation(readings, "steps", value.getCount(), "count", value.getEndTime(), recordId, overallLimit);
            } else if (query.kind.equals("sleep_duration") && record instanceof SleepSessionRecord) {
                SleepSessionRecord value = (SleepSessionRecord) record;
                addObservation(
                    readings,
                    "sleep_duration",
                    sleepMinutes(value),
                    "minutes",
                    value.getEndTime(),
                    recordId,
                    overallLimit
                );
            }
        }
    }

    private void addObservation(
        JSArray readings,
        String metricType,
        double value,
        String unit,
        Instant observedAt,
        String sourceRecordId,
        int overallLimit
    ) {
        if (readings.length() >= overallLimit) {
            return;
        }
        JSObject observation = new JSObject()
            .put("metric_type", metricType)
            .put("value", value)
            .put("unit", unit)
            .put("observed_at", observedAt.toString())
            .put("source", "health_store");
        if (sourceRecordId != null && !sourceRecordId.isEmpty()) {
            // Health Connect can expose multiple observations from one series/correlation record
            // (for example each heart-rate sample or the two sides of blood pressure). Make the
            // identity granular enough for the API's per-source-record deduplication rule.
            observation.put(
                "source_record_id",
                sourceRecordId + ":" + metricType + ":" + observedAt.toEpochMilli()
            );
        }
        readings.put(observation);
    }

    private static long sleepMinutes(SleepSessionRecord session) {
        long stagedSleepMinutes = 0;
        for (SleepSessionRecord.Stage stage : session.getStages()) {
            int stageType = stage.getStage();
            if (
                stageType == SleepSessionRecord.STAGE_TYPE_SLEEPING ||
                stageType == SleepSessionRecord.STAGE_TYPE_LIGHT ||
                stageType == SleepSessionRecord.STAGE_TYPE_DEEP ||
                stageType == SleepSessionRecord.STAGE_TYPE_REM
            ) {
                stagedSleepMinutes += Duration.between(stage.getStartTime(), stage.getEndTime()).toMinutes();
            }
        }
        return stagedSleepMinutes > 0
            ? stagedSleepMinutes
            : Duration.between(session.getStartTime(), session.getEndTime()).toMinutes();
    }

    private void resolveRead(PluginCall call, List<String> requestedMetrics, JSArray readings) {
        JSObject result = new JSObject()
            .put("platform", "android")
            .put("provider", "health_connect")
            .put("readOnly", true)
            .put("requestedMetrics", stringArray(bridgeMetricIds(requestedMetrics)))
            .put("readings", readings);
        getBridge().executeOnMainThread(() -> call.resolve(result));
    }

    private void rejectRead(PluginCall call, Throwable error) {
        boolean permissionProblem = error instanceof SecurityException || error.getCause() instanceof SecurityException;
        String code = permissionProblem ? "PERMISSION_REQUIRED" : "READ_FAILED";
        String message = permissionProblem
            ? "Health Connect permission is required for one or more selected metrics."
            : "Health data could not be read. Check Health Connect and try again.";
        getBridge().executeOnMainThread(() -> call.reject(message, code));
    }

    private static JSObject statusResponse(int sdkStatus) {
        boolean available = sdkStatus == HealthConnectClient.SDK_AVAILABLE;
        boolean needsProviderUpdate = sdkStatus == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED;
        return new JSObject()
            .put("platform", "android")
            .put("provider", "health_connect")
            .put("available", available)
            .put("installed", available || needsProviderUpdate)
            .put("needsProviderUpdate", needsProviderUpdate)
            .put("readOnly", true)
            .put("supportsBackgroundSync", false)
            .put("supportsHistoryAccess", false)
            .put("supportedMetrics", stringArray(bridgeMetricIds(supportedMetrics())));
    }

    private List<String> normalizedMetrics(PluginCall call) {
        JSArray values = call.getArray("metrics");
        if (values == null) {
            return Collections.emptyList();
        }

        List<String> metrics = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) {
            String value = values.optString(index, null);
            String normalized = canonicalMetric(value);
            if (normalized == null) {
                continue;
            }
            if (normalized.equals("blood_pressure")) {
                addIfAbsent(metrics, "systolic_bp");
                addIfAbsent(metrics, "diastolic_bp");
            } else {
                addIfAbsent(metrics, normalized);
            }
        }
        return metrics;
    }

    private static String canonicalMetric(String rawValue) {
        if (rawValue == null) {
            return null;
        }
        String value = rawValue.trim().toLowerCase(Locale.US).replace('-', '_').replace(' ', '_');
        switch (value) {
            case "heart_rate":
            case "heartrate":
                return "heart_rate";
            case "resting_heart_rate":
            case "restingheartrate":
                return "resting_heart_rate";
            case "spo2":
            case "oxygen_saturation":
            case "oxygensaturation":
                return "spo2";
            case "systolic_bp":
            case "systolic":
                return "systolic_bp";
            case "diastolic_bp":
            case "diastolic":
                return "diastolic_bp";
            case "blood_pressure":
            case "bloodpressure":
                return "blood_pressure";
            case "temperature":
            case "body_temperature":
            case "bodytemperature":
                return "temperature";
            case "weight":
                return "weight";
            case "steps":
                return "steps";
            case "sleep_duration":
            case "sleep":
                return "sleep_duration";
            default:
                return null;
        }
    }

    private static List<MetricQuery> metricQueries(List<String> metrics) {
        List<MetricQuery> queries = new ArrayList<>();
        boolean bloodPressureAdded = false;
        for (String metric : metrics) {
            switch (metric) {
                case "heart_rate":
                    queries.add(new MetricQuery("heart_rate", HeartRateRecord.class));
                    break;
                case "resting_heart_rate":
                    queries.add(new MetricQuery("resting_heart_rate", RestingHeartRateRecord.class));
                    break;
                case "spo2":
                    queries.add(new MetricQuery("spo2", OxygenSaturationRecord.class));
                    break;
                case "systolic_bp":
                case "diastolic_bp":
                    if (!bloodPressureAdded) {
                        queries.add(new MetricQuery("blood_pressure", BloodPressureRecord.class));
                        bloodPressureAdded = true;
                    }
                    break;
                case "temperature":
                    queries.add(new MetricQuery("temperature", BodyTemperatureRecord.class));
                    break;
                case "weight":
                    queries.add(new MetricQuery("weight", WeightRecord.class));
                    break;
                case "steps":
                    queries.add(new MetricQuery("steps", StepsRecord.class));
                    break;
                case "sleep_duration":
                    queries.add(new MetricQuery("sleep_duration", SleepSessionRecord.class));
                    break;
                default:
                    break;
            }
        }
        return queries;
    }

    private static String permissionFor(String metric) {
        switch (metric) {
            case "heart_rate":
                return "android.permission.health.READ_HEART_RATE";
            case "resting_heart_rate":
                return "android.permission.health.READ_RESTING_HEART_RATE";
            case "spo2":
                return "android.permission.health.READ_OXYGEN_SATURATION";
            case "systolic_bp":
            case "diastolic_bp":
                return "android.permission.health.READ_BLOOD_PRESSURE";
            case "temperature":
                return "android.permission.health.READ_BODY_TEMPERATURE";
            case "weight":
                return "android.permission.health.READ_WEIGHT";
            case "steps":
                return "android.permission.health.READ_STEPS";
            case "sleep_duration":
                return "android.permission.health.READ_SLEEP";
            default:
                throw new IllegalArgumentException("Unsupported Health Connect metric");
        }
    }

    private static Instant optionInstant(PluginCall call, String primaryKey, String legacyKey, Instant defaultValue) {
        String rawValue = call.getString(primaryKey, call.getString(legacyKey));
        return rawValue == null || rawValue.trim().isEmpty() ? defaultValue : Instant.parse(rawValue);
    }

    private static void addIfAbsent(List<String> values, String value) {
        if (!values.contains(value)) {
            values.add(value);
        }
    }

    private static List<String> supportedMetrics() {
        List<String> values = new ArrayList<>();
        Collections.addAll(
            values,
            "heart_rate",
            "resting_heart_rate",
            "spo2",
            "temperature",
            "systolic_bp",
            "diastolic_bp",
            "weight",
            "steps",
            "sleep_duration"
        );
        return values;
    }

    private static JSArray stringArray(List<String> values) {
        JSArray array = new JSArray();
        for (String value : values) {
            array.put(value);
        }
        return array;
    }

    private static List<String> bridgeMetricIds(List<String> canonicalMetrics) {
        List<String> ids = new ArrayList<>();
        for (String metric : canonicalMetrics) {
            addIfAbsent(ids, bridgeMetricId(metric));
        }
        return ids;
    }

    private static String bridgeMetricId(String canonicalMetric) {
        switch (canonicalMetric) {
            case "heart_rate":
                return "heartRate";
            case "resting_heart_rate":
                return "restingHeartRate";
            case "spo2":
                return "oxygenSaturation";
            case "systolic_bp":
            case "diastolic_bp":
                return "bloodPressure";
            case "temperature":
                return "bodyTemperature";
            case "sleep_duration":
                return "sleep";
            default:
                return canonicalMetric;
        }
    }

    private static void addIfAbsent(JSArray values, String value) {
        for (int index = 0; index < values.length(); index++) {
            if (value.equals(values.optString(index))) {
                return;
            }
        }
        values.put(value);
    }

    private static final class MetricQuery {
        private final String kind;
        private final Class<? extends Record> recordClass;

        private MetricQuery(String kind, Class<? extends Record> recordClass) {
            this.kind = kind;
            this.recordClass = recordClass;
        }
    }
}
