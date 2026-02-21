using System;
using System.Collections.Generic;

namespace SmartRoadMonitor.Models;

public partial class SensorDatum
{
    public long DataId { get; set; }

    public int DeviceId { get; set; }

    public double? AirTemp { get; set; }

    public double? Humidity { get; set; }

    public double? SurfaceTemp { get; set; }

    public double? VisMean { get; set; }

    public double? NirGreenRatio { get; set; }

    public double? WhitenessIndex { get; set; }

    public string? SurfaceType { get; set; }

    public DateTime? RecordedAt { get; set; }

    public virtual Device Device { get; set; } = null!;
}
