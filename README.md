# 🚦 Smart Road Condition Monitoring System

An end-to-end IoT-based intelligent road safety monitoring platform designed to detect and visualize hazardous road conditions such as **ice, snow, and dry asphalt** in real time.

---

## 📌 Problem

Traditional weather APIs provide atmospheric forecasts but do not directly measure real-time **road surface conditions**. This limitation can result in undetected ice or snow hazards, increasing accident risk.

---

## 💡 Solution

This system integrates:

• Embedded spectral & thermal sensing  
• Long-range LoRa communication  
• ASP.NET Core Web API backend  
• SQL Server database  
• Real-time dashboard visualization  
• Google Maps hazard alerts & route safety analysis  

The platform detects surface type, assigns risk levels, and visually alerts users when hazardous conditions are present.

---

# 🏗 System Architecture

```
IoT Sensor Node 
   ↓
LoRa (REYAX RYLR998)
   ↓
ASP.NET Core Web API
   ↓
SQL Server Database
   ↓
Web Dashboard + Google Maps API
```

---

# 🔌 Hardware Layer

• Raspberry Pi Pico 2 W – Main controller  
• MLX90614 – Surface temperature sensor  
• DHT22 – Air temperature & humidity sensor  
• AS7343 – Spectral sensor (VIS Mean, NIR Ratio, Whiteness Index)  
• REYAX RYLR998 – LoRa communication module   

---

# 📡 Communication

• UART-based AT command LoRa communication  
• Long-range, low-power data transmission  
• Reliable packet forwarding to backend API  

---

# 🧠 Backend (ASP.NET Core)

• RESTful Web API  
• Entity Framework Core  
• SQL Server persistence  
• Device registration & management  
• Data filtering by location and duration  
• Risk classification logic  

---

# 📊 Dashboard Features

• Real-time sensor data retrieval  
• Surface classification display  
• Risk indicator (Low / Medium / High)  
• Trend analysis graphs (Air & Surface Temp)  
• Snow prediction integration  
• Historical data filtering  
• Alerts log tracking  

---

# 🗺 Map & Route Safety Features

• Google Maps API integration  
• Hazard marker placement  
• Ice / Snow detection popups  
• Re-route suggestion system  
• Safe route visualization  

---

# 🖼 Project Screenshots

## 🔐 Admin Login
![Admin Login](assets/admin_login.png)

---

## ➕ Add New Device
![Add Device](assets/admin_add_device.png)

---

## 📈 View Sensor Data
![View Data](assets/admin_view_data.png)

---

## 📊 Dashboard Overview
![Dashboard](assets/dashboard.png)

---

## 🗺 Safe Route Finder
![Map Route](assets/map_route.png)

---

## ❄️ Snow Detection on Map
![Snow Detection](assets/map_snow.png)

---

## ⚠️ Ice / Snow Alert Popup
![Map Alert](assets/map_alert.png)

---

## 🔧 Hardware Setup
![Hardware Setup](assets/hardware.jpeg)

---

# 🎥 System Demonstration Videos

## ❄️ Snow Detection Demo  
👉 https://drive.google.com/file/d/1ZULd-0p43aBW0I14okI1I8ELuYCAlo_h/view?usp=sharing  

Demonstrates real-time snow surface classification using spectral analysis and temperature thresholds. Sensor data is transmitted via LoRa to the ASP.NET Core backend, stored in SQL Server, and dynamically retrieved by the dashboard for visualization and risk evaluation.

---

## 🛣 Asphalt Detection Demo  
👉 https://drive.google.com/file/d/1rHKsgJdqUam6YX8pnaBYdBoH8zzlfMwV/view?usp=sharing  

Shows successful detection of dry asphalt conditions using VIS mean, NIR ratio, and surface temperature metrics. Data is processed server-side and rendered in the dashboard, confirming safe road classification.

---

## 🧊 Ice Detection Demo  
👉 https://drive.google.com/file/d/1jodPWaOZ_VkF0dZx2FLKAaqb0sVeL8OQ/view?usp=sharing  

Illustrates hazardous ice detection triggered by low surface temperature and spectral reflectivity characteristics. The detected condition is transmitted over LoRa, persisted in the database, and immediately reflected in the dashboard with updated risk indicators and route hazard alerts.

---

# 🛠 Technologies Used

C#  
ASP.NET Core  
Entity Framework Core  
SQL Server  
Raspberry Pi Pico W  
MicroPython  
LoRa (REYAX RYLR998)  
Google Maps API  
WeatherAPI  
RESTful APIs  
Embedded Systems  

---

# 🚀 Key Highlights

✔ End-to-end IoT data pipeline  
✔ Real-time hazard detection  
✔ Embedded systems + full-stack integration  
✔ Geospatial route safety analysis  
✔ Database-driven dashboard  
✔ Professional admin management interface  

---

# 👥 Collaboration

Developed in collaboration with Agamdeep Singh Sandhu.

---

# 👨‍💻 Author

**Sandip Bohara Chhetri**  
Computer Engineering Technologist
