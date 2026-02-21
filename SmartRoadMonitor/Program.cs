/* ============================================================
   PROGRAM: Smart Road Monitor – Backend API
   FILE: Program.cs
   PROGRAMMER: Sandip Bohara Chhetri

   DESCRIPTION:
   This file is the main entry point of the Smart Road Monitor
   backend. It uses ASP.NET Core Minimal APIs to expose REST
   endpoints that allow:
     - Admin authentication
     - Device registration and management
     - Sensor data ingestion
     - Road surface classification (Asphalt / Snow / Ice)
     - Retrieval of live and historical sensor data
     - Serving the frontend as static files

   The backend communicates with a SQL Server database using
   Entity Framework Core.
   ============================================================ */

using Microsoft.EntityFrameworkCore;              // Provides EF Core database functionality
using SmartRoadMonitor.Models;                    // Contains DbContext and entity models
using System.Text.Json.Serialization;             // Controls JSON serialization behavior

namespace SmartRoadMonitor
{
    public class Program
    {
        /* ====================================================
           INPUT RECORDS (DTOs)
           ----------------------------------------------------
           These records define the expected structure of JSON
           data sent to the API from the frontend or devices.
           ==================================================== */

        // Used by the admin login endpoint
        record LoginInput(string Username, string Password);

        // Used when adding or updating a roadside device
        record DeviceInput(
            string DeviceName,        // Friendly name for the device
            string LocationName,      // Location label (used in UI filters)
            string Address,           // Human-readable address
            double Latitude,          // GPS latitude
            double Longitude          // GPS longitude
        );

        // Used when sensor devices submit readings
        record SensorInput(
            int DeviceID,              // Foreign key linking to Devices table
            double AirTemp,            // Ambient air temperature (°C)
            double Humidity,           // Relative humidity (%)
            double SurfaceTemp,        // Road surface temperature (°C)
            double VIS_Mean,           // Visible light reflectivity value
            double NIR_Green_Ratio,    // Near-infrared reflectivity ratio
            double WhitenessIndex,     // Calculated whiteness index
            string SurfaceType         // Sent by device but recalculated server-side
        );

        /* ====================================================
           TIME HELPER
           ----------------------------------------------------
           Converts UTC time to Mountain Standard Time.
           This ensures consistent timestamps across the
           system regardless of where data originates.
           ==================================================== */
        static DateTime GetMountainTime()
        {
            return TimeZoneInfo.ConvertTimeFromUtc(
                DateTime.UtcNow,
                TimeZoneInfo.FindSystemTimeZoneById("Mountain Standard Time")
            );
        }

        public static void Main(string[] args)
        {
            /* ====================================================
               APPLICATION SETUP
               ==================================================== */

            // Create the ASP.NET Core application builder
            var builder = WebApplication.CreateBuilder(args);

            // Register controller services and configure JSON output
            builder.Services.AddControllers()
                .AddJsonOptions(opt =>
                {
                    // Enforce camelCase JSON to match JavaScript conventions
                    opt.JsonSerializerOptions.PropertyNamingPolicy =
                        System.Text.Json.JsonNamingPolicy.CamelCase;

                    // Prevent circular reference issues when serializing EF entities
                    opt.JsonSerializerOptions.ReferenceHandler =
                        ReferenceHandler.IgnoreCycles;
                });

            // Build the web application
            var app = builder.Build();

            /* ====================================================
               CORS CONFIGURATION
               ----------------------------------------------------
               Allows the frontend (running on a different origin)
               to communicate with this API without restriction.
               ==================================================== */
            app.UseCors(x => x.AllowAnyHeader()
                              .AllowAnyMethod()
                              .SetIsOriginAllowed(_ => true));

            /* ====================================================
               STATIC FILE HOSTING
               ----------------------------------------------------
               Enables the API to serve the frontend files
               (HTML, CSS, JS) directly.
               ==================================================== */
            app.UseDefaultFiles();   // Looks for index.html automatically
            app.UseStaticFiles();    // Serves files from wwwroot

            /* ====================================================
               ADMIN LOGIN ENDPOINT
               ==================================================== */
            app.MapPost("/admin/login", (LoginInput input) =>
            {
                // Create a database context for this request
                using var db = new SmartRoadMonitorContext();

                // Attempt to find an admin with matching credentials
                var admin = db.Admins.FirstOrDefault(a =>
                    a.Username == input.Username &&
                    a.Password == input.Password);

                // If no match is found, return an error response
                if (admin == null)
                    return Results.Json(new
                    {
                        status = "error",
                        message = "Invalid credentials"
                    });

                // Successful login
                return Results.Json(new
                {
                    status = "success",
                    message = "Login successful"
                });
            });

            /* ====================================================
               GET ALL DEVICES
               ----------------------------------------------------
               Returns a list of all registered roadside devices.
               ==================================================== */
            app.MapGet("/devices/all", () =>
            {
                using var db = new SmartRoadMonitorContext();

                // Query devices and project only required fields
                var list = db.Devices
                    .OrderBy(d => d.DeviceId)
                    .Select(d => new
                    {
                        d.DeviceId,
                        d.DeviceName,
                        d.LocationName,
                        d.Address,
                        d.Latitude,
                        d.Longitude,
                        d.CreatedAt
                    })
                    .ToList();

                return Results.Json(list);
            });

            /* ====================================================
               ADD DEVICE
               ----------------------------------------------------
               Registers a new roadside monitoring device.
               ==================================================== */
            app.MapPost("/devices/add", (DeviceInput input) =>
            {
                try
                {
                    using var db = new SmartRoadMonitorContext();

                    // Create a new Device entity from input data
                    var device = new Device
                    {
                        DeviceName = input.DeviceName,
                        LocationName = input.LocationName,
                        Address = input.Address,
                        Latitude = (decimal)input.Latitude,
                        Longitude = (decimal)input.Longitude,
                        CreatedAt = GetMountainTime()
                    };

                    // Persist the device to the database
                    db.Devices.Add(device);
                    db.SaveChanges();

                    return Results.Json(new
                    {
                        status = "success",
                        message = "Device added successfully"
                    });
                }
                catch (Exception ex)
                {
                    // Return error details if insertion fails
                    return Results.Json(new
                    {
                        status = "error",
                        message = ex.Message
                    });
                }
            });

            /* ====================================================
               GET ALL SENSOR DATA (WITH DEVICE INFO)
               ----------------------------------------------------
               Returns sensor readings joined with device metadata.
               ==================================================== */
            app.MapGet("/sensor/all", () =>
            {
                using var db = new SmartRoadMonitorContext();

                // Left join sensor data with devices to handle
                // orphaned sensor records gracefully
                var result =
                    (from s in db.SensorData
                     join d in db.Devices
                        on s.DeviceId equals d.DeviceId into gj
                     from d in gj.DefaultIfEmpty()
                     orderby s.RecordedAt descending
                     select new
                     {
                         s.DataId,
                         s.DeviceId,
                         LocationName = d != null
                             ? d.LocationName
                             : "(Unregistered Device)",
                         DeviceName = d != null
                             ? d.DeviceName
                             : "(Unregistered Device)",
                         s.AirTemp,
                         s.Humidity,
                         s.SurfaceTemp,
                         s.VisMean,
                         s.NirGreenRatio,
                         s.WhitenessIndex,
                         s.SurfaceType,
                         s.RecordedAt
                     }).ToList();

                return Results.Json(result);
            });

            /* ====================================================
               ADD SENSOR DATA
               ----------------------------------------------------
               Accepts raw sensor readings and classifies
               the road surface condition.
               ==================================================== */
            app.MapPost("/sensor/add", (SensorInput input) =>
            {
                try
                {
                    using var db = new SmartRoadMonitorContext();

                    // Extract key values used for classification
                    double riskScore = input.VIS_Mean;
                    double surfaceTemp = input.SurfaceTemp;
                    string surfaceType;

                    // Surface classification rules
                    // Cold surface + high reflectivity implies ice or snow
                    if (surfaceTemp < 7 && riskScore > 4)
                    {
                        if (riskScore > 4 && riskScore < 20)
                            surfaceType = "Ice";
                        else
                            surfaceType = "Snow";
                    }
                    else
                    {
                        // Default condition when risk is low
                        surfaceType = "Asphalt";
                    }

                    // Create sensor data entity
                    var data = new SensorDatum
                    {
                        DeviceId = input.DeviceID,
                        AirTemp = input.AirTemp,
                        Humidity = input.Humidity,
                        SurfaceTemp = input.SurfaceTemp,
                        VisMean = input.VIS_Mean,
                        NirGreenRatio = input.NIR_Green_Ratio,
                        WhitenessIndex = input.WhitenessIndex,
                        SurfaceType = surfaceType,
                        RecordedAt = GetMountainTime()
                    };

                    // Save sensor reading
                    db.SensorData.Add(data);
                    db.SaveChanges();

                    return Results.Json(new
                    {
                        status = "success",
                        message = "Sensor data added successfully",
                        surface = surfaceType
                    });
                }
                catch (Exception ex)
                {
                    return Results.Json(new
                    {
                        status = "error",
                        message = ex.Message
                    });
                }
            });

            /* ====================================================
               GET LATEST SENSOR DATA FOR A DEVICE
               ==================================================== */
            app.MapGet("/sensor/latest/{deviceId:int}", (int deviceId) =>
            {
                using var db = new SmartRoadMonitorContext();

                // Retrieve the most recent sensor record
                var data =
                    (from s in db.SensorData
                     join d in db.Devices
                        on s.DeviceId equals d.DeviceId
                     where s.DeviceId == deviceId
                     orderby s.RecordedAt descending
                     select new
                     {
                         d.LocationName,
                         s.AirTemp,
                         s.Humidity,
                         s.SurfaceTemp,
                         s.SurfaceType,
                         s.RecordedAt
                     }).FirstOrDefault();

                // Return appropriate response based on availability
                return data == null
                    ? Results.Json(new
                    {
                        status = "error",
                        message = "No data found"
                    })
                    : Results.Json(new
                    {
                        status = "success",
                        data
                    });
            });

            /* ====================================================
               UPDATE DEVICE
               ==================================================== */
            app.MapPut("/devices/update/{id}", (int id, DeviceInput input) =>
            {
                try
                {
                    using var db = new SmartRoadMonitorContext();

                    var device =
                        db.Devices.FirstOrDefault(d => d.DeviceId == id);

                    if (device == null)
                        return Results.Json(new
                        {
                            status = "error",
                            message = "Device not found"
                        });

                    // Apply updated values
                    device.DeviceName = input.DeviceName;
                    device.LocationName = input.LocationName;
                    device.Address = input.Address;
                    device.Latitude = (decimal)input.Latitude;
                    device.Longitude = (decimal)input.Longitude;

                    db.SaveChanges();

                    return Results.Json(new
                    {
                        status = "success",
                        message = "Device updated successfully"
                    });
                }
                catch (Exception ex)
                {
                    return Results.Json(new
                    {
                        status = "error",
                        message = ex.Message
                    });
                }
            });

            /* ====================================================
               DELETE DEVICE AND RELATED SENSOR DATA
               ==================================================== */
            app.MapDelete("/devices/delete/{id}", (int id) =>
            {
                try
                {
                    using var db = new SmartRoadMonitorContext();

                    var device =
                        db.Devices.FirstOrDefault(d => d.DeviceId == id);

                    if (device == null)
                        return Results.Json(new
                        {
                            status = "error",
                            message = "Device not found"
                        });

                    // Remove all sensor readings associated with the device
                    var readings =
                        db.SensorData.Where(s => s.DeviceId == id).ToList();

                    if (readings.Any())
                        db.SensorData.RemoveRange(readings);

                    // Remove the device itself
                    db.Devices.Remove(device);
                    db.SaveChanges();

                    return Results.Json(new
                    {
                        status = "success",
                        message = "Device deleted successfully"
                    });
                }
                catch (Exception ex)
                {
                    return Results.Json(new
                    {
                        status = "error",
                        message = ex.Message
                    });
                }
            });

            // Start listening for HTTP requests
            app.Run();
        }
    }
}
