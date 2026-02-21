/* ============================================================
   FILE: js/map.js
   PROJECT: Smart Road Monitor (Frontend - Map View)
   PROGRAMMER: Sandip Bohara Chhetri

   PURPOSE:
   Provides the interactive Google Map view that supports:
     - Viewing live road hazard markers (Ice/Snow/Asphalt)
     - Getting driving directions with alternate routes
     - Checking if current route passes near hazard devices
     - Prompting the user to reroute when hazards appear
     - Manual reroute button
     - Exit button resets route and clears markers

   DATA SOURCES:
     - /devices/all  (device coordinates + names)
     - /sensor/all   (latest surface type per device)

   LIVE UPDATES:
     - Every 10 seconds refresh device + sensor data, redraw markers,
       and re-check route hazards.
============================================================ */
(function () {

  // Prevent this script from initializing multiple times if loaded repeatedly
  if (window.SRM_MAP_INIT_DONE) return;
  window.SRM_MAP_INIT_DONE = true;

  // Backend base URL
  const API_BASE = "http://localhost:5157";

  // Live refresh interval for sensors and marker updates
  const LIVE_REFRESH_MS = 10000;

  // Google Maps objects
  let map, directionsService, directionsRenderer;

  // Geolocation-based current user position (optional)
  let userLocation = null;

  // Route endpoints (Google LatLng objects)
  let startPoint = null;
  let endPoint = null;

  // Markers for start/end selections
  let startMarker = null;
  let endMarker = null;

  // Cached device list from backend and latest sensor record per device
  let devices = [];
  let latestByDevice = {};

  // Map markers representing hazards (colored dots)
  let hazardMarkers = [];

  // Cached routes + polylines for hazard checking
  let lastRoutes = [];
  let routePolylines = [];
  let currentRouteIndex = 0;

  // Tracks last known hazard status per route to detect “newly bad” transitions
  let lastHazardByRoute = {};

  // Cooldown timer to prevent repeated prompts firing too often
  let lastPromptTime = 0;
  const PROMPT_COOLDOWN_MS = 10000;

  /* ==================== API ==================== */

  // Fetch list of devices (coordinates + metadata)
  const fetchDevices = () => $.ajax({ url: `${API_BASE}/devices/all` });

  // Fetch all sensor records (used to compute latest per device)
  const fetchSensors = () => $.ajax({ url: `${API_BASE}/sensor/all` });

  // Build a dictionary: deviceId -> latest sensor row
  function buildLatestByDevice(rows) {
    const latest = {};
    rows.forEach(r => {
      // If first time, or this row is newer than currently stored, replace it
      if (!latest[r.deviceId] || new Date(r.recordedAt) > new Date(latest[r.deviceId].recordedAt))
        latest[r.deviceId] = r;
    });
    return latest;
  }

  // Refreshes device list and latest sensor mapping
  async function refreshLiveData() {
    devices = await fetchDevices();
    const rows = await fetchSensors();
    latestByDevice = buildLatestByDevice(rows);
  }

  /* ==================== INIT ==================== */

  async function init() {
    console.log("[MAP] Initializing...");

    // Load backend data first so we can draw hazard markers ASAP
    await refreshLiveData();

    // Attempt to capture user’s current location (optional)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      });
    }

    // Load Google Maps scripts (including geometry) then build map
    loadGoogle(() => initMap());

    // Wire button handlers
    $("#get-directions-btn").on("click", onGetDirections);
    $("#exit-btn").on("click", resetRoute);

    // Add a manual reroute button to the UI
    createManualRerouteButton();

    // Ensure modal exists for hazard prompts
    ensureModal();

    // Periodic live refresh: update markers + route hazard checks
    setInterval(async () => {
      await refreshLiveData();
      drawAllMarkers();
      checkRouteSurfaceChanges();
    }, LIVE_REFRESH_MS);
  }

  // Dynamically loads Google Maps JS with places + geometry
  function loadGoogle(cb) {

    // If geometry already available, run callback immediately
    if (window.google && google.maps && google.maps.geometry)
      return cb();

    // Otherwise inject script tag with callback hook
    const s = document.createElement("script");
    s.src = "https://maps.googleapis.com/maps/api/js?key=[Google_MapsAPI_Expired and new key needed to be migrated in backend]&libraries=places,geometry&callback=__mapReady";
    s.defer = true;
    window.__mapReady = cb;

    document.body.appendChild(s);
  }

  /* ==================== MAP ==================== */

  function initMap() {

    // Create the Google Map centered on Edmonton (default)
    map = new google.maps.Map(document.getElementById("map"), {
      zoom: 12,
      center: { lat: 53.5461, lng: -113.4938 }
    });

    // Directions services for routing
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({ map });

    // Places SearchBoxes for start/end inputs
    const startBox = new google.maps.places.SearchBox(document.getElementById("start-input"));
    const endBox   = new google.maps.places.SearchBox(document.getElementById("end-input"));

    // When user selects a start place
    startBox.addListener("places_changed", () => {
      const p = startBox.getPlaces()[0];
      if (!p?.geometry) return;

      // Store startpoint as LatLng
      startPoint = p.geometry.location;

      // Replace existing start marker
      if (startMarker) startMarker.setMap(null);
      startMarker = new google.maps.Marker({
        position: startPoint,
        map,
        icon: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png"
      });
    });

    // When user selects an end/destination place
    endBox.addListener("places_changed", () => {
      const p = endBox.getPlaces()[0];
      if (!p?.geometry) return;

      endPoint = p.geometry.location;

      // Replace existing end marker
      if (endMarker) endMarker.setMap(null);
      endMarker = new google.maps.Marker({
        position: endPoint,
        map,
        icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
      });
    });

    // Draw current hazard markers as soon as map is available
    drawAllMarkers();
  }

  /* ==================== ROUTING ==================== */

  // Builds routes using DirectionsService and stores polylines for hazard checks
  async function onGetDirections() {

    // Refresh sensor/devices right before routing
    await refreshLiveData();

    // If user didn’t pick a start point, default to geolocation (if available)
    if (!startPoint && userLocation)
      startPoint = new google.maps.LatLng(userLocation.lat, userLocation.lng);

    // Require a start and end point
    if (!startPoint || !endPoint) {
      showSimple("Select both start and destination");
      return;
    }

    // Request directions with alternate routes enabled
    directionsService.route({
      origin: startPoint,
      destination: endPoint,
      travelMode: google.maps.TravelMode.DRIVING,
      provideRouteAlternatives: true
    }, (result, status) => {

      if (status !== "OK") {
        showSimple("Directions failed");
        return;
      }

      // Cache routes and create matching polylines for hazard detection
      lastRoutes = result.routes || [];
      routePolylines = lastRoutes.map(r => new google.maps.Polyline({ path: r.overview_path }));

      // Start with primary route index 0
      currentRouteIndex = 0;

      // Clear previous hazard state so prompt can trigger again
      lastHazardByRoute = {};

      // Render directions on map (first route)
      directionsRenderer.setDirections(result);
      directionsRenderer.setRouteIndex(0);

    });
  }

  // Switches to the next available alternate route
  function reroute() {

    // Need at least 2 routes to reroute
    if (!lastRoutes.length || lastRoutes.length < 2) {
      showSimple("No alternate route available");
      return;
    }

    // Cycle through available routes
    currentRouteIndex = (currentRouteIndex + 1) % lastRoutes.length;
    directionsRenderer.setRouteIndex(currentRouteIndex);

    // Reset hazard state so checks are recalculated
    lastHazardByRoute = {};
  }

  /* ==================== MARKERS ==================== */

  // Draws hazard markers for each device using the latest surface type
  function drawAllMarkers() {

    if (!map) return;

    // Clear old markers
    hazardMarkers.forEach(m => m.setMap(null));
    hazardMarkers = [];

    // For each device, place a colored marker based on latest sensor surfaceType
    devices.forEach(d => {

      const latest = latestByDevice[d.deviceId];
      if (!latest) return;

      let icon = "";
      const s = (latest.surfaceType || "").toLowerCase();

      // Color scheme:
      //   ice     -> red
      //   snow    -> yellow
      //   asphalt -> green
      if (s === "ice") icon = "https://maps.google.com/mapfiles/ms/icons/red-dot.png";
      else if (s === "snow") icon = "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
      else if (s === "asphalt") icon = "https://maps.google.com/mapfiles/ms/icons/green-dot.png";
      else return; // Unknown surface types are ignored

      // Create map marker at device coordinate
      const marker = new google.maps.Marker({
        position: { lat: +d.latitude, lng: +d.longitude },
        map,
        icon
      });

      // InfoWindow shown on hover for quick details
      const info = new google.maps.InfoWindow({
        content: `
          <b>${latest.surfaceType}</b><br>
          Air: ${latest.airTemp}°C <br>
          Surface: ${latest.surfaceTemp}°C
        `
      });

      marker.addListener("mouseover", () => info.open(map, marker));
      marker.addListener("mouseout", () => info.close());

      hazardMarkers.push(marker);
    });
  }

  /* ==================== HAZARD CHECK ==================== */

  // Determines whether a route is "bad", "good", or "unknown"
  // by checking if device points lie on/near the route polyline.
  function computeRouteHazard(index) {

    if (!routePolylines[index]) return "unknown";

    let hasBad = false;
    let hasGood = false;

    const poly = routePolylines[index];

    // Tolerance used by isLocationOnEdge (higher = wider corridor)
    const tolerance = 0.002;

    devices.forEach(d => {

      const latest = latestByDevice[d.deviceId];
      if (!latest) return;

      // Device position as LatLng
      const pos = new google.maps.LatLng(+d.latitude, +d.longitude);

      // Skip if device is not near this route
      if (!google.maps.geometry.poly.isLocationOnEdge(pos, poly, tolerance)) return;

      // Evaluate surface type
      const s = (latest.surfaceType || "").toLowerCase();
      if (s === "ice" || s === "snow") hasBad = true;
      if (s === "asphalt") hasGood = true;
    });

    // If any bad point exists on route => bad
    // Else if at least one good exists => good
    // Else => unknown (no devices detected near route)
    return hasBad ? "bad" : hasGood ? "good" : "unknown";
  }

  // Checks whether hazard status changed from non-bad to bad
  // and shows prompt if so (with cooldown).
  function checkRouteSurfaceChanges() {

    // No routes => nothing to evaluate
    if (!lastRoutes.length) return;

    // Cooldown to avoid repeating prompt every refresh
    const now = Date.now();
    if (now - lastPromptTime < PROMPT_COOLDOWN_MS) return;

    // Evaluate current hazard state for active route
    const currentHazard = computeRouteHazard(currentRouteIndex);
    const previous = lastHazardByRoute[currentRouteIndex] || "unknown";

    // Trigger prompt only when route becomes "bad" newly
    if (currentHazard === "bad" && previous !== "bad") {

      console.log("⚠ HAZARD DETECTED - SHOWING MODAL");

      lastPromptTime = now;

      showPrompt(
        "⚠ Ice / Snow detected",
        "Hazard detected on your route. Re-route?",
        getHazardSample(currentRouteIndex),
        () => reroute(),   // YES handler: switch route
        () => {}           // NO handler: do nothing
      );

    }

    // Store latest hazard state for this route index
    lastHazardByRoute[currentRouteIndex] = currentHazard;
  }

  // Finds one device point on the route and returns sample data
  // for the modal display (surface type + temps).
  function getHazardSample(index) {

    const poly = routePolylines[index];

    for (const d of devices) {

      const latest = latestByDevice[d.deviceId];
      if (!latest) continue;

      const pos = new google.maps.LatLng(+d.latitude, +d.longitude);

      if (!google.maps.geometry.poly.isLocationOnEdge(pos, poly, 0.002)) continue;

      return {
        surfaceType: latest.surfaceType,
        airTemp: latest.airTemp,
        surfaceTemp: latest.surfaceTemp
      };
    }

    // Fallback if no device lies on route corridor
    return { surfaceType: "--", airTemp: "--", surfaceTemp: "--" };
  }

  /* ==================== MANUAL REROUTE ==================== */

  // Adds a manual reroute button under direction inputs
  function createManualRerouteButton() {

    // Prevent duplicates if script runs again
    if ($("#rerouteBtn").length) return;

    $(".directions-controls").append(`
      <button id="rerouteBtn"
        style="background:#ff9800;color:white;border:none;padding:8px 14px;border-radius:6px">
        Manual Re-route
      </button>
    `);

    // Manual reroute cycles to next available route
    $("#rerouteBtn").on("click", () => {
      console.log("MANUAL RE-ROUTE");
      reroute();
    });
  }

  /* ==================== MODAL ==================== */

  // Ensures modal HTML exists (created once)
  function ensureModal() {

    if ($("#routeModal").length) return;

    $("body").append(`
      <div id="routeModal" style="
        position:fixed;
        inset:0;
        display:none;
        align-items:center;
        justify-content:center;
        background:rgba(0,0,0,.45);
        z-index:9999;">
        <div style="background:#fff;padding:20px;border-radius:12px;width:90%;max-width:380px">

          <h3 id="modalTitle">Alert</h3>
          <p id="modalMsg"></p>

          <div style="background:#f5f7fc;padding:10px;border-radius:6px">
            <div>Surface: <b id="modalSurface"></b></div>
            <div>Surface Temp: <b id="modalSurfaceTemp"></b> °C</div>
            <div>Air Temp: <b id="modalAirTemp"></b> °C</div>
          </div>

          <div style="text-align:right;margin-top:15px;">
            <button id="modalNo">No</button>
            <button id="modalYes" style="background:#173a8b;color:white">Yes</button>
          </div>

        </div>
      </div>
    `);
  }

  // Shows modal prompt with handlers
  function showPrompt(title, message, sample, onYes, onNo) {

    // Fill modal text
    $("#modalTitle").text(title);
    $("#modalMsg").text(message);

    // Fill sample hazard data
    $("#modalSurface").text(sample.surfaceType);
    $("#modalSurfaceTemp").text(sample.surfaceTemp);
    $("#modalAirTemp").text(sample.airTemp);

    // YES click: hide modal, then run callback
    $("#modalYes").off().on("click", () => {
      $("#routeModal").hide();
      onYes && onYes();
    });

    // NO click: hide modal, then run callback
    $("#modalNo").off().on("click", () => {
      $("#routeModal").hide();
      onNo && onNo();
    });

    // Show modal
    $("#routeModal").css("display", "flex");
  }

  // Simple wrapper to show a message without sample values
  function showSimple(msg) {
    showPrompt("Alert", msg, { surfaceType: "--", airTemp: "--", surfaceTemp: "--" });
  }

  /* ==================== EXIT ==================== */

  // Resets route display and clears temporary state
  function resetRoute() {

    // Clear directions from renderer
    directionsRenderer.setDirections({ routes: [] });

    // Remove hazard markers
    hazardMarkers.forEach(m => m.setMap(null));
    hazardMarkers = [];

    // Clear route cache
    lastRoutes = [];
    routePolylines = [];

    // Remove start/end markers
    if (startMarker) startMarker.setMap(null);
    if (endMarker) endMarker.setMap(null);

    startPoint = null;
    endPoint = null;
  }

  // Start initialization when DOM ready
  $(init);

})();
