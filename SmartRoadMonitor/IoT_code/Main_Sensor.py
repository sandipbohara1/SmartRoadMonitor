"""
Smart Road Condition Monitoring with LoRa Transmission
Raspberry Pi Pico W

This program monitors road surface conditions using:
- AS7343 spectral sensor
- MLX90614 infrared temperature sensor
- DHT22 air temperature and humidity sensor
- RYLR998 LoRa module for wireless transmission

The system calculates reflectivity features, classifies the surface,
and transmits data in CSV format every few seconds.
"""

import machine
import time
import qwiic_as7343
import dht
import utime
from machine import Pin, PWM


# ------------------------------------------------------------
# Servo Setup
# ------------------------------------------------------------

"""
Servo is optional and can be used to adjust sensor angle.
It is initialized but not actively used in the monitoring loop.
"""

SERVO_PIN = 14
SERVO_ANGLE = 160  # Example fixed angle reference

servo = PWM(Pin(SERVO_PIN))
servo.freq(50)  # Standard servo frequency

def set_angle(angle):
    """
    Move servo to a given angle between 0 and 180 degrees.
    Converts angle into appropriate PWM duty cycle.
    """
    min_duty = 2000
    max_duty = 8000
    duty = int(min_duty + (angle / 180) * (max_duty - min_duty))
    servo.duty_u16(duty)


# ------------------------------------------------------------
# AS7343 I2C Wrapper
# ------------------------------------------------------------

"""
The AS7343 library expects specific read/write functions.
This wrapper adapts MicroPython's I2C class to match that interface.
"""

class I2CWrapper:
    def __init__(self, i2c):
        self.i2c = i2c

    def read_byte(self, addr, reg):
        # Read one byte from device register
        return self.i2c.readfrom_mem(addr, reg, 1)[0]

    def write_byte(self, addr, reg, val):
        # Write one byte to device register
        self.i2c.writeto_mem(addr, reg, bytes([val]))

    def read_word(self, addr, reg):
        # Read two bytes and combine into 16-bit value
        data = self.i2c.readfrom_mem(addr, reg, 2)
        return data[0] | (data[1] << 8)

    def write_word(self, addr, reg, val):
        # Write 16-bit value into register
        data = bytes([val & 0xFF, (val >> 8) & 0xFF])
        self.i2c.writeto_mem(addr, reg, data)

    def isDeviceConnected(self, addr):
        # Check if device responds on bus
        try:
            self.i2c.writeto(addr, b'')
            return True
        except OSError:
            return False


# ------------------------------------------------------------
# MLX90614 Temperature Sensor
# ------------------------------------------------------------

"""
MLX90614 provides:
Ambient_Temp     -> internal sensor temperature
surrounding_temp -> object temperature interpreted as road surface
"""

MLX90614_I2CADDR = 0x5A
MLX90614_TA = 0x06
MLX90614_TOBJ1 = 0x07

def read_temp(i2c, reg):
    """
    Read temperature register from MLX90614
    and convert raw value to Celsius.
    """
    try:
        data = i2c.readfrom_mem(MLX90614_I2CADDR, reg, 3)
        raw = data[1] << 8 | data[0]
        return (raw * 0.02) - 273.15
    except OSError:
        print("Temperature read error")
        return None


# ------------------------------------------------------------
# Spectral Feature Calculation
# ------------------------------------------------------------

"""
Extract reflectivity features from AS7343.
These values help differentiate asphalt, snow, and ice.
"""

def compute_features(sensor):
    # Read selected spectral channels
    R = sensor.get_data(6)
    G = sensor.get_data(4)
    B = sensor.get_data(3)
    NIR = sensor.get_data(14)

    # Average visible intensity
    VIS_mean = (R + G + B) / 3.0

    # Infrared relative to green
    NIR_Green_ratio = NIR / (G + 1)

    # Visible reflectance relative to infrared
    whiteness = (R + G + B) / (NIR + 1)

    print(f"R={R} G={G} B={B} NIR={NIR}")

    return VIS_mean, NIR_Green_ratio, whiteness


# ------------------------------------------------------------
# LoRa Communication
# ------------------------------------------------------------

"""
The RYLR998 LoRa module is controlled via UART
using AT commands.
"""

uart = machine.UART(
    1,
    baudrate=115200,
    tx=machine.Pin(4),
    rx=machine.Pin(5)
)

def send_command(command):
    """
    Send AT command and print module response.
    """
    if isinstance(command, str):
        command = command.encode('ascii')

    uart.write(command + b"\r\n")
    utime.sleep(0.5)

    while uart.any():
        response = uart.read()
        if response:
            print("Response:",
                  response.decode('utf-8', 'ignore'))

def initialize_lora():
    """
    Configure LoRa address, network ID, and frequency.
    """
    print("Initializing LoRa...")
    send_command("AT")
    send_command("AT+ADDRESS=1")
    send_command("AT+NETWORKID=5")
    send_command("AT+BAND=915000000")
    print("LoRa initialized\n")

def send_lora_message(data):
    """
    Send formatted CSV sensor data
    to destination node 2.
    """
    length = len(data)
    command = f"AT+SEND=2,{length},{data}"
    send_command(command)


# ------------------------------------------------------------
# Main Monitoring Loop
# ------------------------------------------------------------

"""
Main function initializes hardware
and continuously reads sensors,
classifies surface,
prints readings,
and transmits data over LoRa.
"""

def main():

    print("\n=== Smart Road Condition Monitoring ===\n")

    # Initialize I2C buses
    i2c_spec = machine.I2C(
        0,
        scl=machine.Pin(1),
        sda=machine.Pin(0),
        freq=400000
    )

    i2c_temp = machine.I2C(
        1,
        scl=machine.Pin(7),
        sda=machine.Pin(6),
        freq=100000
    )

    # Wrap I2C0 for AS7343
    i2c = I2CWrapper(i2c_spec)

    # Initialize DHT22
    dht_sensor = dht.DHT22(machine.Pin(15))

    # Initialize spectral sensor
    sensor = qwiic_as7343.QwiicAS7343(i2c_driver=i2c)
    sensor.power_on(True)
    sensor.set_auto_smux(sensor.kAutoSmux18Channels)
    sensor.spectral_measurement_enable(True)

    print("Sensors ready.\n")

    # Initialize LoRa
    initialize_lora()

    # Classification thresholds
    W_THRESHOLD = 1.2
    R_THRESHOLD = 0.8

    while True:

        # Read air temperature and humidity
        try:
            dht_sensor.measure()
            ambient_temp = dht_sensor.temperature()
            humidity = dht_sensor.humidity()
        except Exception as e:
            ambient_temp, humidity = None, None
            print("DHT22 error:", e)

        # Read infrared temperatures
        Ambient_Temp = read_temp(i2c_temp, MLX90614_TA)
        surrounding_temp = read_temp(i2c_temp, MLX90614_TOBJ1)

        # Capture spectral reading
        sensor.set_led_on()
        time.sleep(0.1)
        sensor.read_all_spectral_data()
        sensor.set_led_off()

        VIS_mean, NIR_Green_ratio, whiteness = compute_features(sensor)

        # Surface classification logic
        if (surrounding_temp is not None and
            surrounding_temp <= 0 and
            whiteness > W_THRESHOLD and
            NIR_Green_ratio < R_THRESHOLD):
            surface = "ICE DETECTED"

        elif (surrounding_temp is not None and
              surrounding_temp <= 0 and
              NIR_Green_ratio < R_THRESHOLD):
            surface = "POSSIBLE BLACK ICE"

        else:
            surface = "NORMAL"

        # Print current readings
        print("\n--- Live Data ---")
        print(f"Air Temp: {ambient_temp:.2f} °C")
        print(f"Humidity: {humidity:.2f}%")
        print(f"Surface Temp: {surrounding_temp:.2f} °C")
        print(f"Ambient Sensor Temp: {Ambient_Temp:.2f} °C")
        print(f"VIS_mean: {VIS_mean:.2f}")
        print(f"NIR/Green Ratio: {NIR_Green_ratio:.2f}")
        print(f"Whiteness Index: {whiteness:.2f}")
        print(f"Surface Condition: {surface}")

        # Prepare CSV payload
        message = (
            f"{ambient_temp:.1f},"
            f"{humidity:.1f},"
            f"{surrounding_temp:.1f},"
            f"{VIS_mean:.1f},"
            f"{NIR_Green_ratio:.2f},"
            f"{whiteness:.2f}"
        )

        # Transmit via LoRa
        send_lora_message(message)

        time.sleep(5)


try:
    main()
except KeyboardInterrupt:
    print("\nMonitoring stopped by user.")