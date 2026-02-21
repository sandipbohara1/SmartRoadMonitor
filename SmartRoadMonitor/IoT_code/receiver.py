"""
LoRa Receiver and API Forwarder
Raspberry Pi Pico W

This script listens for incoming LoRa packets over UART, extracts the CSV payload,
converts it into a structured JSON object, and posts it to an ASP.NET Core API.
It also includes an optional mock-data mode for testing without LoRa traffic.
"""

import machine
import utime
import network
import urequests
import json
import random


"""
Network Configuration

The Pico W connects to a Wi-Fi access point so it can forward received sensor
readings to an HTTP API endpoint. Update SSID, password, and API_URL to match
your environment.
"""

WIFI_SSID = "PicoAP"
WIFI_PASSWORD = "TestPass99"
API_URL = "http://172.20.10.4:5157/sensor/add"


"""
UART Setup

The LoRa module communicates using AT commands over UART1.
TX and RX pins must match your wiring.
"""

uart = machine.UART(1, baudrate=115200, tx=machine.Pin(4), rx=machine.Pin(5))


def send_command(command):
    """
    Send a single AT command to the LoRa module.

    The RYLR module responds on UART, but this function keeps things quiet
    by discarding incoming response bytes after a short delay.
    """
    if isinstance(command, str):
        command = command.encode('ascii')

    uart.write(command + b"\r\n")
    utime.sleep(0.5)

    # Drain any response bytes so the buffer stays clean.
    while uart.any():
        uart.read()


def initialize_lora():
    """
    Initialize the LoRa module to act as the receiver.

    Address is set to 2 so it can receive messages sent to node 2.
    Network ID and band must match the sender configuration.
    """
    print("Initializing LoRa...")
    send_command("AT")
    send_command("AT+ADDRESS=2")
    send_command("AT+NETWORKID=5")
    send_command("AT+BAND=915000000")
    print("LoRa initialized and ready to receive.")


def connect_to_wifi():
    """
    Connect the Pico W to the configured Wi-Fi network.

    The function waits up to 20 seconds, printing status during retries.
    If connection fails, a RuntimeError is raised so the program can stop
    cleanly instead of running without network access.
    """
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)

    if not wlan.isconnected():
        print("\n--- Starting Wi-Fi Connection ---")
        print(f"Connecting to SSID: {WIFI_SSID}")
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)

        max_wait = 20
        while max_wait > 0:
            if wlan.isconnected():
                break
            status = wlan.status()
            print(f"Status: {status}, tries left: {max_wait}")
            utime.sleep(1)
            max_wait -= 1

        if not wlan.isconnected():
            print("ERROR: Wi-Fi connection failed.")
            raise RuntimeError("Wi-Fi connection failed")

    print(f"\nWi-Fi Connected! IP: {wlan.ifconfig()[0]}")
    return wlan


def send_data_to_api(data):
    """
    Send parsed sensor data to the ASP.NET Core API.

    Data is posted as JSON to API_URL. Any request failure is caught and
    printed so the receiver can keep running.
    """
    try:
        headers = {"Content-Type": "application/json"}
        print(f"Sending to API: {API_URL}")
        response = urequests.post(
            API_URL,
            data=json.dumps(data),
            headers=headers,
            timeout=5
        )
        print(f"API Sent | Status: {response.status_code} | Response: {response.text}")
        response.close()
    except Exception as e:
        print(f"ERROR sending to API: {e}")


def receive_messages():
    """
    Main receive loop.

    The LoRa module sends received packets in a format like:
    +RCV=<addr>,<len>,<payload>,<RSSI>,<SNR>

    The payload in this project is expected to be CSV with 6 values:
    AirTemp, Humidity, SurfaceTemp, VIS_Mean, NIR_Green_Ratio, WhitenessIndex

    If a valid payload is received, it is converted to floats, wrapped
    into a JSON object, and forwarded to the API.
    """
    print("\nWaiting for LoRa data...")

    # ----------------------------------------------------------------------
    # Mock mode made for testing the API and JSON formatting without needing actual LoRa traffic.
    #
    # If you want to test the API and JSON formatting without LoRa traffic,
    # uncomment this entire block and comment out the real LoRa loop below.
    # ----------------------------------------------------------------------
    #
    # while True:
    #     air_temp = round(random.uniform(20.0, 30.0), 2)
    #     humidity = round(random.uniform(40.0, 70.0), 2)
    #     surface_temp = 4.0
    #     vis_mean = 6.0
    #     nir_green_ratio = round(random.uniform(0.2, 0.9), 2)
    #     whiteness_index = round(random.uniform(0.3, 1.0), 2)
    #
    #     sensor_data = {
    #         "DeviceID": 16,
    #         "AirTemp": air_temp,
    #         "Humidity": humidity,
    #         "SurfaceTemp": surface_temp,
    #         "VIS_Mean": vis_mean,
    #         "NIR_Green_Ratio": nir_green_ratio,
    #         "WhitenessIndex": whiteness_index
    #     }
    #
    #     print("-" * 25)
    #     print("MOCK DATA:", sensor_data)
    #     send_data_to_api(sensor_data)
    #     utime.sleep(5)
    #
    # ----------------------------------------------------------------------

    while True:
        if uart.any():
            msg = uart.read()
            if msg:
                try:
                    msg_str = msg.decode("utf-8").strip()

                    # Only process lines that match the LoRa receive format.
                    if msg_str.startswith("+RCV="):
                        parts = msg_str.split(",")

                        # Payload starts at parts[2] and may contain commas,
                        # so we join everything up to the RSSI and SNR fields.
                        payload = ",".join(parts[2:-2])
                        print("Raw payload:", payload)

                        values = payload.split(",")

                        # Expected payload format:
                        # temp_dht, humidity, temp_mlx, vis, nir, white
                        if len(values) == 6:
                            temp_dht, humidity, temp_mlx, vis, nir, white = values

                            # Convert CSV strings into numeric values.
                            surrounding_temp = float(temp_dht)
                            hum_pct = float(humidity)
                            temp_surface = float(temp_mlx)
                            VIS = float(vis)
                            NIR = float(nir)
                            whiteness_flt = float(white)

                            print(
                                f"DHT22: {surrounding_temp}C, {hum_pct}% | "
                                f"MLX: {temp_surface}C | VIS={VIS} | NIR={NIR} | White={whiteness_flt}"
                            )

                            # Build JSON payload for the API.
                            sensor_data = {
                                "DeviceID": 16,
                                "AirTemp": surrounding_temp,
                                "Humidity": hum_pct,
                                "SurfaceTemp": temp_surface,
                                "VIS_Mean": VIS,
                                "NIR_Green_Ratio": NIR,
                                "WhitenessIndex": whiteness_flt
                            }

                            send_data_to_api(sensor_data)
                        else:
                            print("Malformed LoRa packet:", msg_str)

                except ValueError:
                    print("Error converting data to float")
                except UnicodeError:
                    print("Unreadable LoRa bytes received")
                except Exception as e:
                    print("General error:", e)

        # Small sleep keeps the loop responsive without pegging the CPU.
        utime.sleep(0.1)


def main():
    """
    Program entry point.

    Sets up LoRa receiver settings, connects to Wi-Fi,
    then stays in the receive loop indefinitely.
    """
    try:
        initialize_lora()
        connect_to_wifi()
        receive_messages()
    except RuntimeError as e:
        print("CRITICAL ERROR:", e)


main()