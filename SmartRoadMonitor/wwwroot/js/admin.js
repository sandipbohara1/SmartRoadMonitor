/* ============================================================
   FILE: js/admin.js
   PROJECT: Smart Road Monitor (Frontend - Admin)
   PROGRAMMER: Sandip Bohara Chhetri

   PURPOSE:
   Handles Admin UI workflow:
     1) Login screen
     2) Admin panel UI injection (View Devices / View Sensor / Add Device)
     3) Devices CRUD (list, edit, delete)
     4) Sensor table view with filters (location + duration)
     5) Google Places autocomplete for entering device location
     6) Coordinate parser (DMS -> decimal) for manual coordinate input

============================================================ */
$(document).ready(function () {
  // Base URL of the backend API
  const API_BASE = "http://localhost:5157";

  // -------------------------------------------------
  // ADMIN LOGIN (front-end validation + demo check)
  // -------------------------------------------------
  $("#loginBtn").click(function () {
    // Read credentials from input fields
    const username = $("#adminUser").val().trim();
    const password = $("#adminPass").val().trim();

    // Basic empty-field validation
    if (!username || !password) {
      $("#loginMsg").text("Enter both username and password.").css("color", "red");
      return;
    }

    // Demo-style login check (client side)
    // If valid, replace Admin section with admin panel UI
    if (username === "admin123" && password === "admin123") {
      $("#loginMsg").text("Login successful.").css("color", "green");
      setTimeout(function () { showAdminPanel(username); }, 350);
    } else {
      $("#loginMsg").text("Invalid credentials.").css("color", "red");
    }
  });

  // -------------------------------------------------
  // ADMIN PANEL (UI injection)
  // -------------------------------------------------
  function showAdminPanel(username) {
    // Replace the entire adminSection content with new HTML
    const html = `
      <div class="card">
        <h2>Welcome, ${username}</h2>
        <p>You are logged in as an administrator.</p>

        <div class="admin-actions">
          <button id="viewDevicesBtn">View Devices</button>
          <button id="viewSensorBtn">View Sensor Data</button>
          <button id="addDeviceBtn">Add New Device</button>
        </div>

        <div id="adminContent" class="admin-content">
          <p>Select an option above to view or modify data.</p>
        </div>
      </div>
    `;
    $("section#adminSection").html(html);

    // Modal root exists for future usage.
    // Delete currently uses confirm(), but this overlay can be reused later.
    if ($("#globalModalRoot").length === 0) {
      $("body").append(`
        <div id="globalModalRoot" class="modal-overlay" style="display:none;">
          <div class="modal-box">
            <h3 id="modalTitle">Confirm</h3>
            <p id="modalMessage">Are you sure?</p>
            <div class="modal-actions">
              <button id="modalConfirmBtn">Yes</button>
              <button id="modalCancelBtn" class="cancelBtn">No</button>
            </div>
          </div>
        </div>
      `);

      // Cancel hides modal and removes confirm handler
      $("#modalCancelBtn").on("click", function () {
        $("#globalModalRoot").hide();
        $("#modalConfirmBtn").off("click");
      });
    }

    // Wire up admin panel buttons
    $("#viewDevicesBtn").click(loadDevices);
    $("#viewSensorBtn").click(loadSensorData);
    $("#addDeviceBtn").click(showAddDeviceForm);
  }

  // -------------------------------------------------
  // DEVICES (LIST + EDIT + DELETE)
  // -------------------------------------------------
  function loadDevices() {
    // Temporary loading state in admin content area
    $("#adminContent").html("<p>Loading devices...</p>");

    $.ajax({
      url: API_BASE + "/devices/all",
      type: "GET",
      success: function (devices) {
        // Handle empty dataset
        if (!devices || devices.length === 0) {
          $("#adminContent").html("<p>No devices found.</p>");
          return;
        }

        // Build table HTML
        let html = `
          <h3>Registered Devices</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Location</th><th>Address</th>
                <th>Latitude</th><th>Longitude</th><th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
        `;

        // Add a row per device
        devices.forEach(function (d) {
          html += `
            <tr data-id="${d.deviceId}">
              <td>${d.deviceId}</td>
              <td>${d.deviceName}</td>
              <td>${d.locationName || "-"}</td>
              <td>${d.address || "-"}</td>
              <td>${Number(d.latitude).toFixed(5)}</td>
              <td>${Number(d.longitude).toFixed(5)}</td>
              <td>${new Date(d.createdAt).toLocaleString()}</td>
              <td class="action-buttons">
                <button class="editBtn">Edit</button>
                <button class="deleteBtn">Delete</button>
              </td>
            </tr>
          `;
        });

        html += "</tbody></table>";
        $("#adminContent").html(html);

        // ---- Edit Device ----
        $(".editBtn").click(function () {
          // Identify selected device row
          const row = $(this).closest("tr");
          const id = row.data("id");

          // Read existing values from table cells
          const name = row.find("td:eq(1)").text();
          const loc  = row.find("td:eq(2)").text();
          const addr = row.find("td:eq(3)").text();
          const lat  = row.find("td:eq(4)").text();
          const lng  = row.find("td:eq(5)").text();

          // Insert an inline edit form directly after the device row
          const form = `
            <tr class="editRow">
              <td colspan="8">
                <h4>Edit Device #${id}</h4>
                <div class="form-grid">
                  <input type="text" id="editName" value="${name}" placeholder="Device Name">
                  <input type="text" id="editLocation" value="${loc}" placeholder="Search or Enter Coordinates">
                  <input type="text" id="editAddress" value="${addr}" placeholder="Address">
                  <input type="number" step="0.000001" id="editLat" value="${lat}" placeholder="Latitude" readonly>
                  <input type="number" step="0.000001" id="editLng" value="${lng}" placeholder="Longitude" readonly>
                </div>
                <div class="inline-actions">
                  <button id="saveEditBtn">Save</button>
                  <button id="cancelEditBtn" class="cancelBtn">Cancel</button>
                </div>
                <p id="editMsg"></p>
              </td>
            </tr>
          `;

          // Ensure only one edit row exists at a time
          $(".editRow").remove();

          // Insert form after this row and hide original row
          row.after(form);
          row.hide();

          // Google Places library may not be loaded yet, so initialize safely
          const initEditAutocompleteSafely = () => {
            if (window.google && window.google.maps && window.google.maps.places) {
              initEditLocationAutocomplete();
            } else {
              setTimeout(initEditAutocompleteSafely, 500);
            }
          };
          initEditAutocompleteSafely();

          // Cancel restores original row and removes edit form
          $("#cancelEditBtn").click(function () {
            $(".editRow").remove();
            row.show();
          });

          // Save sends a PUT request with updated device data
          $("#saveEditBtn").click(function () {
            const updated = {
              DeviceName: $("#editName").val(),
              LocationName: $("#editLocation").val(),
              Address: $("#editAddress").val(),
              Latitude: parseFloat($("#editLat").val()),
              Longitude: parseFloat($("#editLng").val())
            };

            $.ajax({
              url: API_BASE + "/devices/update/" + id,
              type: "PUT",
              contentType: "application/json",
              data: JSON.stringify(updated),
              success: function (res) {
                // Show confirmation message and refresh device list
                $("#editMsg").text(res.message || "Updated.").css("color", "green");
                setTimeout(loadDevices, 900);
              },
              error: function (xhr) {
                // Display raw server response text for debugging
                $("#editMsg").text("Error updating: " + xhr.responseText).css("color", "red");
              }
            });
          });
        });

        // ---- Delete Device ----
        $(".deleteBtn").click(function () {
          const row = $(this).closest("tr");
          const id = row.data("id");

          // Confirm first (simple browser confirm)
          if (!confirm("Are you sure you want to delete this device?")) {
            return;
          }

          // DELETE request removes device and related sensor data (backend behavior)
          $.ajax({
            url: API_BASE + "/devices/delete/" + id,
            type: "DELETE",
            success: function (res) {
              // Add a success message row and remove the deleted row
              row.after('<tr><td colspan="8" class="msgSuccess">' + (res.message || "Deleted.") + '</td></tr>');
              row.remove();
            },
            error: function (xhr) {
              row.after('<tr><td colspan="8" class="msgError">Error deleting: ' + xhr.responseText + '</td></tr>');
            }
          });
        });
      },
      error: function () {
        $("#adminContent").html("<p style='color:red'>Failed to load devices.</p>");
      }
    });
  }

  // -------------------------------------------------
  // ADD DEVICE (with Places + coordinate parser)
  // -------------------------------------------------
  function showAddDeviceForm() {
    // Build the Add Device form UI
    const form = `
      <div class="form-card">
        <h3>Add New Device</h3>
        <div class="form-grid">
          <input type="text" id="deviceName" placeholder="Device Name">
          <input type="text" id="locationName" placeholder="Search or Enter Coordinates">
          <input type="text" id="address" placeholder="Address">
          <input type="number" step="0.000001" id="latitude" placeholder="Latitude" readonly>
          <input type="number" step="0.000001" id="longitude" placeholder="Longitude" readonly>
        </div>
        <button id="saveDeviceBtn">Save Device</button>
        <p id="addMsg"></p>
      </div>
    `;
    $("#adminContent").html(form);

    // Google Places may load after this file; keep checking until available
    const initAutocompleteSafely = () => {
      if (window.google && window.google.maps && window.google.maps.places) {
        initLocationAutocomplete();
      } else {
        setTimeout(initAutocompleteSafely, 500);
      }
    };
    initAutocompleteSafely();

    // Save new device to backend
    $("#saveDeviceBtn").click(function () {
      const device = {
        DeviceName: $("#deviceName").val(),
        LocationName: $("#locationName").val(),
        Address: $("#address").val(),
        Latitude: parseFloat($("#latitude").val()),
        Longitude: parseFloat($("#longitude").val())
      };

      // Minimal validation
      if (!device.DeviceName || !device.LocationName) {
        $("#addMsg").text("Fill required fields.").css("color", "red");
        return;
      }

      $.ajax({
        url: API_BASE + "/devices/add",
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify(device),
        success: function () {
          // Clear form after successful add
          $("#addMsg").text("Device added successfully.").css("color", "green");
          $("#deviceName, #locationName, #address, #latitude, #longitude").val("");
        },
        error: function (xhr) {
          $("#addMsg").text("Error adding device: " + xhr.responseText).css("color", "red");
        }
      });
    });
  }

  // -------------------------------------------------
  // Coordinate Parser Helper (DMS → decimal)
  // -------------------------------------------------
  function parseCoordinateInput(input) {
    // Accepts patterns like:
    //   53°26'29.1"N 113°29'32.5"W
    // Converts to decimal lat/lon.
    const regex = /(\d{1,3})[°\s]+(\d{1,2})['\s]+([\d.]+)"?([NnSs])?\s*,?\s*(\d{1,3})[°\s]+(\d{1,2})['\s]+([\d.]+)"?([EeWw])?/;
    const match = input.match(regex);
    if (!match) return null;

    // Degrees + minutes/60 + seconds/3600
    let lat = (+match[1]) + (+match[2] / 60) + (+match[3] / 3600);
    let lon = (+match[5]) + (+match[6] / 60) + (+match[7] / 3600);

    // Apply hemisphere sign
    if (match[4] && match[4].toUpperCase() === "S") lat = -lat;
    if (match[8] && match[8].toUpperCase() === "W") lon = -lon;

    return { lat, lon };
  }

  // -------------------------------------------------
  // Google Places Autocomplete (Add Device)
  // -------------------------------------------------
  function initLocationAutocomplete() {
    const input = document.getElementById("locationName");
    if (!input) return;

    // Allow manual coordinate entry (DMS) without selecting from Places
    input.addEventListener("change", () => {
      const coords = parseCoordinateInput(input.value);
      if (coords) {
        $("#address").val("Manual coordinate input");
        $("#latitude").val(coords.lat.toFixed(6));
        $("#longitude").val(coords.lon.toFixed(6));
      }
    });

    // Configure Places Autocomplete
    const autocomplete = new google.maps.places.Autocomplete(input, {
      types: ["geocode"],
      fields: ["geometry", "formatted_address"],
      componentRestrictions: { country: ["ca"] }
    });

    // When a place is selected, fill address + lat/lon
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry || !place.geometry.location) return;

      $("#address").val(place.formatted_address || "");
      $("#latitude").val(place.geometry.location.lat().toFixed(6));
      $("#longitude").val(place.geometry.location.lng().toFixed(6));
    });
  }

  // -------------------------------------------------
  // Google Places Autocomplete (Edit Device)
  // -------------------------------------------------
  function initEditLocationAutocomplete() {
    const input = document.getElementById("editLocation");
    if (!input) return;

    // Manual DMS coordinate entry support in edit flow
    input.addEventListener("change", () => {
      const coords = parseCoordinateInput(input.value);
      if (coords) {
        $("#editAddress").val("Manual coordinate input");
        $("#editLat").val(coords.lat.toFixed(6));
        $("#editLng").val(coords.lon.toFixed(6));
      }
    });

    const autocomplete = new google.maps.places.Autocomplete(input, {
      types: ["geocode"],
      fields: ["geometry", "formatted_address"],
      componentRestrictions: { country: ["ca"] }
    });

    // Update edit fields when a place is chosen
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry || !place.geometry.location) return;

      $("#editAddress").val(place.formatted_address || "");
      $("#editLat").val(place.geometry.location.lat().toFixed(6));
      $("#editLng").val(place.geometry.location.lng().toFixed(6));
    });
  }

  // -------------------------------------------------
  // SENSOR DATA (VIEW + FILTER)
  // -------------------------------------------------
  function loadSensorData() {
    $("#adminContent").html("<p>Loading sensor data...</p>");

    $.ajax({
      url: API_BASE + "/sensor/all",
      type: "GET",
      success: function (data) {
        // No data case
        if (!data || data.length === 0) {
          $("#adminContent").html("<p>No sensor data found.</p>");
          return;
        }

        // Build unique list of locations for dropdown
        const locations = [...new Set(data.map(d => d.locationName).filter(Boolean))];

        // Build sensor viewer UI
        let html = `
          <h3>Recent Sensor Data</h3>
          <div class="filter-container">
            <label>Location:</label>
            <select id="filterLocation">
              <option value="all">All</option>
              ${locations.map(l => `<option value="${l}">${l}</option>`).join("")}
            </select>
            <label>Duration:</label>
            <select id="filterDuration">
              <option value="24">Last 24 hrs</option>
              <option value="168">Last 7 days</option>
              <option value="336">Last 14 days</option>
              <option value="all">All</option>
            </select>
            <button id="applyFilterBtn">Apply</button>
          </div>
          <div id="sensorTableContainer"></div>
        `;

        $("#adminContent").html(html);

        // Initial render shows all sensor rows
        renderSensorTable(data);

        // Apply filters on button click
        $("#applyFilterBtn").click(function () {
          let filtered = data;
          const loc = $("#filterLocation").val();
          const dur = $("#filterDuration").val();

          // Location filter
          if (loc !== "all") filtered = filtered.filter(x => x.locationName === loc);

          // Duration filter (by recordedAt)
          if (dur !== "all") {
            const cutoff = new Date();
            cutoff.setHours(cutoff.getHours() - parseInt(dur, 10));
            filtered = filtered.filter(x => new Date(x.recordedAt) >= cutoff);
          }

          renderSensorTable(filtered);
        });
      },
      error: function () {
        $("#adminContent").html("<p style='color:red'>Failed to load sensor data.</p>");
      }
    });
  }

  // Renders a sensor data table into #sensorTableContainer
  function renderSensorTable(data) {
    if (!data || data.length === 0) {
      $("#sensorTableContainer").html("<p>No data found.</p>");
      return;
    }

    // Table headers match what the backend returns from /sensor/all
    let html = `
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th><th>Device</th><th>Location</th>
            <th>AirTemp</th><th>Humidity</th><th>SurfaceTemp</th>
            <th>VIS Mean</th><th>NIR Ratio</th><th>Whiteness</th>
            <th>SurfaceType</th><th>Recorded</th>
          </tr>
        </thead>
        <tbody>
    `;

    // Add each sensor record row
    data.forEach(function (s) {
      html += `
        <tr>
          <td>${s.dataId}</td>
          <td>${s.deviceName || s.deviceId}</td>
          <td>${s.locationName || "-"}</td>
          <td>${s.airTemp != null ? Number(s.airTemp).toFixed(2) : "--"}</td>
          <td>${s.humidity != null ? Number(s.humidity).toFixed(2) : "--"}</td>
          <td>${s.surfaceTemp != null ? Number(s.surfaceTemp).toFixed(2) : "--"}</td>
          <td>${s.visMean != null ? Number(s.visMean).toFixed(2) : "--"}</td>
          <td>${s.nirGreenRatio != null ? Number(s.nirGreenRatio).toFixed(2) : "--"}</td>
          <td>${s.whitenessIndex != null ? Number(s.whitenessIndex).toFixed(2) : "--"}</td>
          <td>${s.surfaceType || "-"}</td>
          <td>${new Date(s.recordedAt).toLocaleString()}</td>
        </tr>
      `;
    });

    html += "</tbody></table>";
    $("#sensorTableContainer").html(html);
  }
});
