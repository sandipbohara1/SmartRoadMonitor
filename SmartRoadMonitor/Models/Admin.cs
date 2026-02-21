using System;
using System.Collections.Generic;

namespace SmartRoadMonitor.Models;

public partial class Admin
{
    public int AdminId { get; set; }

    public string Username { get; set; } = null!;

    public string Password { get; set; } = null!;
}
