using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace SmartRoadMonitor.Models;

public partial class SmartRoadMonitorContext : DbContext
{
    public SmartRoadMonitorContext()
    {
    }

    public SmartRoadMonitorContext(DbContextOptions<SmartRoadMonitorContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Admin> Admins { get; set; }

    public virtual DbSet<Device> Devices { get; set; }

    public virtual DbSet<SensorDatum> SensorData { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
#warning To protect potentially sensitive information in your connection string, you should move it out of source code. You can avoid scaffolding the connection string by using the Name= syntax to read it from configuration - see https://go.microsoft.com/fwlink/?linkid=2131148. For more guidance on storing connection strings, see https://go.microsoft.com/fwlink/?LinkId=723263.
        => optionsBuilder.UseSqlServer("Server=data.cnt.sast.ca,24680;Database=SmartRoadMonitor;User Id=sboharachhetri1;Password=CNT_123;Encrypt=false");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Admin>(entity =>
        {
            entity.HasKey(e => e.AdminId).HasName("PK__Admins__719FE4E84E88F844");

            entity.HasIndex(e => e.Username, "UQ__Admins__536C85E4078742E9").IsUnique();

            entity.Property(e => e.AdminId).HasColumnName("AdminID");
            entity.Property(e => e.Password).HasMaxLength(100);
            entity.Property(e => e.Username).HasMaxLength(50);
        });

        modelBuilder.Entity<Device>(entity =>
        {
            entity.HasKey(e => e.DeviceId).HasName("PK__Devices__49E12331D137E7AF");

            entity.Property(e => e.DeviceId).HasColumnName("DeviceID");
            entity.Property(e => e.Address).HasMaxLength(255);
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(getdate())")
                .HasColumnType("datetime");
            entity.Property(e => e.DeviceName).HasMaxLength(100);
            entity.Property(e => e.Latitude).HasColumnType("decimal(9, 6)");
            entity.Property(e => e.LocationName).HasMaxLength(255);
            entity.Property(e => e.Longitude).HasColumnType("decimal(9, 6)");
        });

        modelBuilder.Entity<SensorDatum>(entity =>
        {
            entity.HasKey(e => e.DataId).HasName("PK__SensorDa__9D05305D7C65D91A");

            entity.Property(e => e.DataId).HasColumnName("DataID");
            entity.Property(e => e.DeviceId).HasColumnName("DeviceID");
            entity.Property(e => e.NirGreenRatio).HasColumnName("NIR_Green_Ratio");
            entity.Property(e => e.RecordedAt)
                .HasDefaultValueSql("(getdate())")
                .HasColumnType("datetime");
            entity.Property(e => e.SurfaceType).HasMaxLength(50);
            entity.Property(e => e.VisMean).HasColumnName("VIS_Mean");

            entity.HasOne(d => d.Device).WithMany(p => p.SensorData)
                .HasForeignKey(d => d.DeviceId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__SensorDat__Devic__2A4B4B5E");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
