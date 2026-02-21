/* ============================================================
   FILE: js/dashboard.js
   PROJECT: Smart Road Monitor (Frontend - Dashboard)
   PROGRAMMER: Sandip Bohara Chhetri

   PURPOSE:
   This script drives the "Dashboard" page:
     - Loads device locations from backend (/devices/all)
     - Polls sensor data periodically (/sensor/all)
     - Filters readings by selected location
     - Displays current conditions + risk level
     - Builds an alerts table (recent readings)
     - Renders 3 trend charts using Chart.js:
         (1) Surface temp
         (2) Air temp
         (3) Humidity
     - Calls WeatherAPI forecast endpoint to display a 7-day
       snow chance visualization for the selected location.

   TIMING:
     - Dashboard refresh every 5 seconds (REFRESH_MS)
     - Weather refresh throttled to 60 seconds (WEATHER_REFRESH_MS)

============================================================ */
$(document).ready(function () {

    // Base URL for backend API endpoints
    const API_BASE = "http://localhost:5157";

    // API key for WeatherAPI forecast calls
    const WEATHER_API_KEY = "[Weather_API_Expired and new key needed to be migrated in backend]";

    // How often to refresh dashboard data (sensor polling)
    const REFRESH_MS = 5000;

    // Weather refresh throttling (avoid hitting WeatherAPI too frequently)
    const WEATHER_REFRESH_MS = 60000;

    // Tracks the last rendered snow forecast so UI doesn't flicker unnecessarily
    let lastSnowSignature = "";

    // Tracks last time weather forecast was updated
    let lastWeatherUpdate = 0;

    // Cached list of devices from /devices/all (used for location dropdown + weather lat/lon)
    let devicesList = [];

    // Chart.js instances (stored so we can update/destroy cleanly)
    let slipTrendChart = null;
    let airTrendChart = null;
    let humidTrendChart = null;

    // Initial load: populate locations dropdown, then start polling
    loadLocations();

    // Poll sensor data and update UI continuously
    setInterval(refreshDashboard, REFRESH_MS);

    // If user changes location or duration, refresh immediately
    $("#commonLocation, #commonDuration").on("change", refreshDashboard);


    /* ==================== TIME ==================== */

    // Converts a timestamp string into Mountain Time display format
    // (Uses America/Edmonton in toLocaleString)
    function toMountainTime(dateString) {
        return new Date(dateString).toLocaleString("en-CA", {
            timeZone: "America/Edmonton",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }


    /* ==================== LOCATIONS ==================== */

    // Loads devices, extracts unique location names, fills dropdown
    function loadLocations() {
        $.get(API_BASE + "/devices/all", function (devices) {
            devicesList = devices || [];

            // Deduplicate locationName values (ignore empty/null)
            const unique = [...new Set(devicesList.map(d => d.locationName).filter(Boolean))];

            // Populate the dashboard location dropdown
            const dd = $("#commonLocation");
            dd.empty();

            unique.forEach(l => dd.append(`<option>${l}</option>`));

            // After loading locations, refresh dashboard immediately
            refreshDashboard();
        });
    }


    /* ==================== MAIN REFRESH ==================== */

    // Core dashboard refresh function:
    //  1) Reads selected location + duration
    //  2) Updates weather forecast (throttled)
    //  3) Gets sensor data from backend
    //  4) Filters by location
    //  5) Updates current conditions, alerts, and charts
    function refreshDashboard() {

        const location = $("#commonLocation").val();
        const hours = parseInt($("#commonDuration").val());

        // If dropdown is empty (no location chosen yet), do nothing
        if (!location) return;

        // Update snow forecast for this location (throttled)
        updateWeather(location);

        // Pull sensor dataset from backend
        $.get(API_BASE + "/sensor/all", function (data) {

            // If no sensor records exist, clear everything
            if (!data || data.length === 0) {
                clearCurrent();
                clearAlerts();
                clearCharts();
                return;
            }

            // Filter all sensor rows by selected location
            let byLocation = data.filter(r => r.locationName === location);

            // If no readings for selected location, clear UI
            if (byLocation.length === 0) {
                clearCurrent();
                clearAlerts();
                clearCharts();
                return;
            }

            // Sort readings newest first
            byLocation.sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));

            // The most recent reading drives "Current Conditions"
            const latest = byLocation[0];

            updateCurrent(latest);
            updateAlerts(byLocation);

            // Chart data is filtered by time window (duration dropdown)
            let chartData = [...byLocation];

            if (!isNaN(hours) && hours > 0) {
                const cutoff = Date.now() - (hours * 60 * 60 * 1000);
                chartData = chartData.filter(r => new Date(r.recordedAt).getTime() >= cutoff);
            }

            // If duration filtering removes everything, fallback to full dataset
            if (chartData.length === 0)
                chartData = [...byLocation];

            updateCharts(chartData);
        });
    }


    /* ================= WEATHER ================= */

    // Calls WeatherAPI using device lat/lon for the selected location
    // Builds 7-day snow chance display as bar rows
    function updateWeather(locationName) {

        // Throttle updates to reduce API calls
        if (Date.now() - lastWeatherUpdate < WEATHER_REFRESH_MS)
            return;

        // Find the device that matches the selected location
        const device = devicesList.find(d => d.locationName === locationName);

        // If no device or coordinates missing, clear forecast area
        if (!device || device.latitude == null || device.longitude == null) {

            $("#snowForecast").html("");
            $("#weatherAlert").text("No GPS in DB").css("color", "orange");
            return;
        }

        const lat = device.latitude;
        const lon = device.longitude;

        // WeatherAPI forecast endpoint (7 days)
        const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${lat},${lon}&days=7`;

        // Fetch forecast JSON
        $.get(url, function (data) {

            // Record that we updated weather now
            lastWeatherUpdate = Date.now();

            // Signature used to prevent UI flicker if values did not change
            let newSignature = "";
            let html = "";

            // Build snow rows for each forecast day
            data.forecast.forecastday.forEach((d, i) => {

                // Label day: Today or weekday name
                const day = i === 0 ? "Today" :
                    new Date(d.date).toLocaleDateString("en-US", { weekday: "short" });

                // daily chance of snow (0-100)
                const snow = d.day.daily_chance_of_snow;

                // Add to signature so we can compare previous render
                newSignature += `${day}:${snow}|`;

                // Build one display row (day label + bar + icon + percent)
                html += `
                  <div class="snow-row">
                    <div class="snow-day-name">${day}</div>
                    <div class="snow-bar-container">
                      <div class="snow-bar-fill" style="width:${snow}%"></div>
                    </div>
                    <div class="snow-icon">❄️</div>
                    <div class="snow-percent">${snow}%</div>
                  </div>
                `;
            });

            // Only replace HTML if forecast changed (prevents flicker)
            if (newSignature !== lastSnowSignature) {
                $("#snowForecast").html(html);
                lastSnowSignature = newSignature;
            }

            // Value is computed but not used directly in UI here
            const today = data.forecast.forecastday[0].day.daily_chance_of_snow;

        });
    }


    /* ================= CURRENT CONDITIONS ================= */

    // Updates the Current Conditions card from the newest reading
    function updateCurrent(latest) {

        // Use optional chaining to avoid errors if field missing
        $("#airTemp").text(latest.airTemp?.toFixed(1) ?? "--");
        $("#humidity").text(latest.humidity?.toFixed(1) ?? "--");
        $("#surfaceTemp").text(latest.surfaceTemp?.toFixed(1) ?? "--");
        $("#surfaceType").text(latest.surfaceType ?? "--");

        // Default risk is Low unless Ice or Snow
        let risk = "Low", cls = "low";

        // Risk mapping based on surfaceType
        if (latest.surfaceType === "Ice") { risk = "High"; cls = "high"; }
        else if (latest.surfaceType === "Snow") { risk = "Moderate"; cls = "medium"; }

        // Update risk label + CSS class
        $("#riskLevel").removeClass().addClass(cls).text("Risk: " + risk);
        $("#slipIndex").text(risk);
    }

    // Resets the Current Conditions card to placeholder values
    function clearCurrent() {
        $("#airTemp").text("--");
        $("#humidity").text("--");
        $("#surfaceTemp").text("--");
        $("#surfaceType").text("--");
        $("#riskLevel").removeClass().addClass("low").text("Risk: --");
        $("#slipIndex").text("--");
    }


    /* ================= ALERT LOG ================= */

    // Populates alert table with the latest N readings (N=10)
    function updateAlerts(data) {

        const table = $("#alertTable");
        table.html("");

        data
            .slice(0, 10) // show last 10 records
            .forEach(r => {
                table.append(`
                  <tr>
                    <td>${toMountainTime(r.recordedAt)}</td>
                    <td>${r.locationName}</td>
                    <td>${r.surfaceType}</td>
                  </tr>
                `);
            });
    }

    // Clears alert table
    function clearAlerts() {
        $("#alertTable").html("");
    }


    /* ================= DATA DOWNSAMPLING ================= */

    // Reduces large datasets into fewer points to keep charts readable
    // maxPoints default is 7
    function downsampleData(data, maxPoints = 7) {

        // If data already small enough, return unchanged
        if (data.length <= maxPoints) return data;

        // Pick every 'step' data point
        const step = Math.floor(data.length / maxPoints);
        const sampled = [];

        for (let i = 0; i < data.length; i += step) {
            sampled.push(data[i]);
        }

        return sampled;
    }


    /* ================= CHARTS (SMART ZOOM) ================= */

    // Creates/updates the Chart.js charts
    function updateCharts(data) {

        // If no data, destroy charts and exit
        if (!data || data.length === 0) {
            clearCharts();
            return;
        }

        // Ensure chronological order (Chart.js expects labels in order)
        data.sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

        // If too many points, downsample for clarity
        let chartInput = data;
        if (data.length > 30)
            chartInput = downsampleData(data, 7);

        // Build labels in Mountain Time format
        const labels = chartInput.map(d =>
            new Date(d.recordedAt).toLocaleString("en-CA", {
                timeZone: "America/Edmonton",
                hour: "2-digit",
                minute: "2-digit",
                month: "2-digit",
                day: "2-digit"
            })
        );

        // Extract datasets
        const surf = chartInput.map(d => d.surfaceTemp);
        const air = chartInput.map(d => d.airTemp);
        const hum = chartInput.map(d => d.humidity);

        // Shared zoom + pan options for all charts
        const chartOptions = {
            responsive: true,
            plugins: {
                zoom: {
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: "x"
                    },
                    pan: {
                        enabled: true,
                        mode: "x"
                    }
                }
            }
        };

        // ---- Surface temp chart (slipTrend) ----
        if (!slipTrendChart) {
            slipTrendChart = new Chart($("#slipTrend"), {
                type: "line",
                data: { labels, datasets: [{ label: "Surface °C", data: surf }] },
                options: chartOptions
            });
        } else {
            slipTrendChart.data.labels = labels;
            slipTrendChart.data.datasets[0].data = surf;
            slipTrendChart.update();
        }

        // ---- Air temp chart (tempTrend) ----
        if (!airTrendChart) {
            airTrendChart = new Chart($("#tempTrend"), {
                type: "line",
                data: { labels, datasets: [{ label: "Air °C", data: air }] },
                options: chartOptions
            });
        } else {
            airTrendChart.data.labels = labels;
            airTrendChart.data.datasets[0].data = air;
            airTrendChart.update();
        }

        // ---- Humidity chart (humidTrend) ----
        if (!humidTrendChart) {
            humidTrendChart = new Chart($("#humidTrend"), {
                type: "line",
                data: { labels, datasets: [{ label: "Humidity %", data: hum }] },
                options: chartOptions
            });
        } else {
            humidTrendChart.data.labels = labels;
            humidTrendChart.data.datasets[0].data = hum;
            humidTrendChart.update();
        }
    }

    // Destroys chart instances (free resources + prevent overlap)
    function clearCharts() {
        if (slipTrendChart) { slipTrendChart.destroy(); slipTrendChart = null; }
        if (airTrendChart) { airTrendChart.destroy(); airTrendChart = null; }
        if (humidTrendChart) { humidTrendChart.destroy(); humidTrendChart = null; }
    }
});
