# Storm Command Center

A local severe-weather operations dashboard inspired by livestream storm-desk workflows. It uses public NOAA/NWS/SPC/NCEP sources rather than proprietary WeatherWise, MyRadar, or RadarOmega feeds.

## Run

From this folder:

```powershell
python -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/
```

## Live Features

- NOAA MRMS radar WMS layers with time-frame playback.
- Single-site WSR-88D reflectivity, velocity, hydrometeor, and rainfall layers.
- NWS active alert feed with polygon overlays, simple reports, full NWS text, in-app popups, optional desktop notifications, and optional alert tone.
- NWS point forecast, hourly chart, nearby station observations, and point-specific alerts.
- SPC Day 1/2/3 categorical outlook overlays plus Day 1 tornado, wind, and hail probability overlays.
- NWS short-fuse warning WMS layer.
- Radar-site markers, drawing tools, distance measurement, area measurement, base-map switching, and CONUS fit.
- SPC, NCEP MAG, NOMADS, WPC, NHC, watches, mesoscale discussions, and storm report links.

## Primary Sources

- NWS API: https://www.weather.gov/documentation/services-web-api
- NOAA OpenGeo services directory: https://opengeo.ncep.noaa.gov/geoserver/www/index.html
- SPC outlook products: https://www.spc.noaa.gov/products/outlook/
- NCEP MAG: https://mag.ncep.noaa.gov/
- NOMADS: https://nomads.ncep.noaa.gov/
- NHC: https://www.nhc.noaa.gov/

## Safety

This is an analysis dashboard. For life-safety decisions, use official NWS warnings, NOAA Weather Radio, local emergency management, and trusted broadcast meteorologists.
