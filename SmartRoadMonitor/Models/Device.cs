using System;
using System.Collections.Generic;

namespace SmartRoadMonitor.Models;

public partial class Device
{
    public int DeviceId { get; set; }

    public string DeviceName { get; set; } = null!;

    public string? LocationName { get; set; }

    public string? Address { get; set; }

    public decimal Latitude { get; set; }

    public decimal Longitude { get; set; }

    public DateTime? CreatedAt { get; set; }

    public virtual ICollection<SensorDatum> SensorData { get; set; } = new List<SensorDatum>();
}
