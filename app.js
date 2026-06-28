(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const NOAA_WMS = "https://opengeo.ncep.noaa.gov/geoserver";
  const NWS_API = "https://api.weather.gov";
  const SPC_OUTLOOK = "https://www.spc.noaa.gov/products/outlook";

  const CONUS_PRODUCTS = {
    conus_bref_qcd: {
      label: "MRMS base reflectivity",
      service: `${NOAA_WMS}/conus/conus_bref_qcd/ows`,
      layer: "conus_bref_qcd",
      style: "radar_reflectivity",
      legend: `${NOAA_WMS}/conus/conus_bref_qcd/ows?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&width=500&height=30&layer=conus_bref_qcd`
    },
    conus_cref_qcd: {
      label: "MRMS composite reflectivity",
      service: `${NOAA_WMS}/conus/conus_cref_qcd/ows`,
      layer: "conus_cref_qcd",
      style: "radar_reflectivity",
      legend: `${NOAA_WMS}/conus/conus_cref_qcd/ows?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&width=500&height=30&layer=conus_cref_qcd`
    },
    conus_neet_v18: {
      label: "MRMS echo tops",
      service: `${NOAA_WMS}/conus/conus_neet_v18/ows`,
      layer: "conus_neet_v18",
      style: "radar_echo_tops",
      legend: `${NOAA_WMS}/conus/conus_neet_v18/ows?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&width=500&height=30&layer=conus_neet_v18`
    },
    conus_pcpn_typ: {
      label: "MRMS precipitation type",
      service: `${NOAA_WMS}/conus/conus_pcpn_typ/ows`,
      layer: "conus_pcpn_typ",
      style: "radar_precip_type",
      legend: `${NOAA_WMS}/conus/conus_pcpn_typ/ows?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&width=500&height=30&layer=conus_pcpn_typ`
    }
  };

  const SITE_PRODUCTS = {
    sr_bref: { label: "Base reflectivity", style: "radar_reflectivity" },
    sr_bvel: { label: "Base velocity", style: "radar_velocity" },
    bdhc: { label: "Hydrometeor class", style: "radar_bdhc" },
    boha: { label: "One-hour rainfall", style: "radar_boha" },
    bdsa: { label: "Storm-total rainfall", style: "radar_bdsa" }
  };

  const OUTLOOKS = {
    day1cat: { label: "SPC Day 1", url: `${SPC_OUTLOOK}/day1otlk_cat.nolyr.geojson` },
    day2cat: { label: "SPC Day 2", url: `${SPC_OUTLOOK}/day2otlk_cat.nolyr.geojson` },
    day3cat: { label: "SPC Day 3", url: `${SPC_OUTLOOK}/day3otlk_cat.nolyr.geojson` },
    day1torn: { label: "Day 1 tornado", url: `${SPC_OUTLOOK}/day1otlk_torn.nolyr.geojson` },
    day1wind: { label: "Day 1 wind", url: `${SPC_OUTLOOK}/day1otlk_wind.nolyr.geojson` },
    day1hail: { label: "Day 1 hail", url: `${SPC_OUTLOOK}/day1otlk_hail.nolyr.geojson` }
  };

  const GUIDANCE = {
    day1: {
      prefix: "day1",
      href: `${SPC_OUTLOOK}/day1otlk.html`,
      fallback: `${SPC_OUTLOOK}/day1otlk_sm.gif`
    },
    day2: {
      prefix: "day2",
      href: `${SPC_OUTLOOK}/day2otlk.html`,
      fallback: `${SPC_OUTLOOK}/day2otlk_sm.gif`
    },
    day3: {
      prefix: "day3",
      href: `${SPC_OUTLOOK}/day3otlk.html`,
      fallback: `${SPC_OUTLOOK}/day3otlk_sm.gif`
    }
  };

  const HIGH_IMPACT_EVENTS = [
    "Tornado Warning",
    "Tornado Watch",
    "Severe Thunderstorm Warning",
    "Severe Thunderstorm Watch",
    "Flash Flood Warning",
    "Flash Flood Watch",
    "Extreme Wind Warning",
    "Storm Surge Warning",
    "Hurricane Warning",
    "Tropical Storm Warning",
    "Special Marine Warning"
  ];

  const ALERT_COLORS = {
    "Tornado Warning": "#d96dff",
    "Tornado Watch": "#d78cff",
    "Severe Thunderstorm Warning": "#ff4f5e",
    "Severe Thunderstorm Watch": "#ffc857",
    "Flash Flood Warning": "#39bfd2",
    "Flash Flood Watch": "#71a7ff",
    "Extreme Wind Warning": "#ff7a7a",
    "Special Marine Warning": "#39bfd2",
    "Hurricane Warning": "#ff8c42",
    "Tropical Storm Warning": "#52d273",
    "Flood Warning": "#52d273",
    "Winter Storm Warning": "#71a7ff"
  };

  const state = {
    map: null,
    baseLayers: [],
    activeBase: 0,
    radarLayer: null,
    radarVisible: true,
    radarFrames: [],
    radarFrameIndex: 0,
    radarTimer: null,
    radarConfig: null,
    warningsWmsLayer: null,
    alertLayer: null,
    alertLayerVisible: true,
    allAlerts: [],
    pointAlerts: [],
    seenAlertIds: new Set(),
    alertFeedInitialized: false,
    alertLoading: false,
    selectedPoint: null,
    selectedMarker: null,
    siteLayer: null,
    radarSites: [],
    outlookLayers: {},
    hourlyChart: null,
    notifyEnabled: false,
    soundEnabled: false,
    audioContext: null
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    restoreSeenAlerts();
    initStaticIcons();
    setupMap();
    attachEvents();
    setupGuidance();

    await Promise.allSettled([
      loadRadarSites(),
      updateRadarLayer(),
      loadAlerts(),
      refreshEnabledOutlooks(),
      loadNhc()
    ]);

    window.setInterval(loadAlerts, 60000);
    window.setInterval(() => updateRadarLayer(true), 5 * 60000);
  }

  function initStaticIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function setupMap() {
    state.map = L.map("map", {
      zoomControl: true,
      preferCanvas: true
    }).setView([39.2, -96.7], 5);

    state.baseLayers = [
      {
        label: "Dark",
        layer: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap &copy; CARTO"
        })
      },
      {
        label: "Light",
        layer: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors"
        })
      },
      {
        label: "Satellite",
        layer: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
          maxZoom: 19,
          attribution: "Tiles &copy; Esri"
        })
      }
    ];
    state.baseLayers[state.activeBase].layer.addTo(state.map);

    state.warningsWmsLayer = L.tileLayer.wms(`${NOAA_WMS}/wwa/warnings/ows`, {
      layers: "warnings",
      styles: "wwa_warnings",
      format: "image/png",
      transparent: true,
      opacity: 0.88,
      version: "1.1.1",
      attribution: "NOAA/NWS warning polygons"
    }).addTo(state.map);

    state.alertLayer = L.geoJSON([], {
      style: styleAlertFeature,
      onEachFeature: bindAlertPopup
    }).addTo(state.map);

    state.siteLayer = L.layerGroup();

    const drawnItems = new L.FeatureGroup();
    state.map.addLayer(drawnItems);
    const drawControl = new L.Control.Draw({
      position: "topleft",
      draw: {
        circle: false,
        circlemarker: false,
        marker: true,
        rectangle: true,
        polygon: {
          showArea: true,
          shapeOptions: { color: "#ffc857", weight: 2 }
        },
        polyline: {
          shapeOptions: { color: "#39bfd2", weight: 3 }
        }
      },
      edit: {
        featureGroup: drawnItems
      }
    });
    state.map.addControl(drawControl);

    state.map.on(L.Draw.Event.CREATED, (event) => {
      const layer = event.layer;
      drawnItems.addLayer(layer);
      annotateDrawnLayer(layer);
    });

    state.map.on("mousemove", (event) => {
      $("#mapReadout").textContent = `Lat ${event.latlng.lat.toFixed(4)}, Lon ${event.latlng.lng.toFixed(4)}`;
    });

    state.map.on("click", (event) => {
      const { lat, lng } = event.latlng;
      $("#latInput").value = lat.toFixed(4);
      $("#lonInput").value = lng.toFixed(4);
      loadPointWeather(lat, lng);
    });

    state.map.on("moveend", () => {
      if ($("#boundsFilter").checked) renderAlerts();
    });
  }

  function attachEvents() {
    $("#radarProduct").addEventListener("change", () => {
      $("#singleSiteControls").hidden = $("#radarProduct").value !== "single_site";
      updateRadarLayer(true);
    });
    $("#radarOpacity").addEventListener("input", (event) => {
      const opacity = Number(event.target.value) / 100;
      if (state.radarLayer) state.radarLayer.setOpacity(opacity);
    });
    $("#radarFrame").addEventListener("input", (event) => {
      state.radarFrameIndex = Number(event.target.value);
      applyRadarFrame();
    });
    $("#radarPrevBtn").addEventListener("click", () => stepRadar(-1));
    $("#radarNextBtn").addEventListener("click", () => stepRadar(1));
    $("#radarPlayBtn").addEventListener("click", toggleRadarLoop);
    $("#refreshRadarBtn").addEventListener("click", () => updateRadarLayer(true));
    $("#siteProduct").addEventListener("change", () => updateRadarLayer(true));
    $("#radarSite").addEventListener("change", () => {
      zoomToSelectedSite();
      updateRadarLayer(true);
    });
    $("#siteSearch").addEventListener("input", () => populateRadarSiteSelect($("#siteSearch").value));

    $("#warningsToggle").addEventListener("change", (event) => {
      if (event.target.checked) state.warningsWmsLayer.addTo(state.map);
      else state.map.removeLayer(state.warningsWmsLayer);
    });
    $("#radarSitesToggle").addEventListener("change", (event) => {
      if (event.target.checked) state.siteLayer.addTo(state.map);
      else state.map.removeLayer(state.siteLayer);
    });
    $$("[data-outlook]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => toggleOutlook(checkbox.dataset.outlook, checkbox.checked));
    });
    $("#refreshOutlooksBtn").addEventListener("click", refreshEnabledOutlooks);

    $("#loadPointBtn").addEventListener("click", () => {
      const lat = Number($("#latInput").value);
      const lon = Number($("#lonInput").value);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        showToast("Point needed", "Enter a valid latitude and longitude.", { tone: "warn" });
        return;
      }
      loadPointWeather(lat, lon);
    });
    $("#clearPointBtn").addEventListener("click", clearPoint);
    $("#findMeBtn").addEventListener("click", useMyLocation);
    $("#notifyBtn").addEventListener("click", requestDesktopNotifications);
    $("#soundBtn").addEventListener("click", toggleSound);

    $("#baseLayerBtn").addEventListener("click", cycleBaseLayer);
    $("#radarToggleBtn").addEventListener("click", toggleRadarVisibility);
    $("#alertLayerBtn").addEventListener("click", toggleAlertLayerVisibility);
    $("#fitConusBtn").addEventListener("click", fitConus);

    $("#alertFilter").addEventListener("change", renderAlerts);
    $("#boundsFilter").addEventListener("change", renderAlerts);
    $("#alertList").addEventListener("click", handleAlertListClick);
    $("#toastRegion").addEventListener("click", handleToastClick);
    $("#closeDialogBtn").addEventListener("click", () => $("#alertDialog").close());

    $$(".tab-button").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });
    $$(".guidance-button").forEach((button) => {
      button.addEventListener("click", () => setGuidance(button.dataset.guidance));
    });
  }

  async function updateRadarLayer(forceTimes) {
    const config = getRadarConfig();
    if (!config) return;
    const previousConfig = state.radarConfig;

    setStatus("radarStatus", "Radar: loading frames", "warn");
    stopRadarLoop();

    try {
      if (forceTimes || !state.radarFrames.length || !sameRadarConfig(config, previousConfig)) {
        state.radarFrames = await fetchWmsTimes(config.service, config.layer);
      }
      state.radarConfig = config;
      state.radarFrameIndex = Math.max(0, state.radarFrames.length - 1);
      if (state.radarLayer) {
        state.map.removeLayer(state.radarLayer);
      }
      state.radarLayer = L.tileLayer.wms(config.service, {
        layers: config.layer,
        styles: config.style || "",
        format: "image/png",
        transparent: true,
        opacity: Number($("#radarOpacity").value) / 100,
        version: "1.1.1",
        attribution: "NOAA/NWS MRMS"
      });
      if (state.radarVisible) state.radarLayer.addTo(state.map);
      updateRadarControls();
      applyRadarFrame();
      $("#radarLegend").src = config.legend;
      $("#radarLegend").alt = `${config.label} legend`;
      setStatus("radarStatus", `Radar: ${config.label}`, "ok");
    } catch (error) {
      console.error(error);
      setStatus("radarStatus", "Radar: feed error", "fail");
      showToast("Radar feed error", error.message || "NOAA radar layer did not load.", { tone: "warn" });
    }
  }

  function getRadarConfig() {
    const selected = $("#radarProduct").value;
    if (selected !== "single_site") return CONUS_PRODUCTS[selected];

    const site = $("#radarSite").value || "ktlx";
    const product = $("#siteProduct").value;
    const siteLower = site.toLowerCase();
    const layer = `${siteLower}_${product}`;
    const productInfo = SITE_PRODUCTS[product];
    return {
      label: `${site.toUpperCase()} ${productInfo.label}`,
      service: `${NOAA_WMS}/${siteLower}/ows`,
      layer,
      style: productInfo.style,
      legend: `${NOAA_WMS}/${siteLower}/ows?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&width=500&height=30&layer=${layer}`
    };
  }

  function sameRadarConfig(a, b) {
    if (!a || !b) return false;
    return a.service === b.service && a.layer === b.layer;
  }

  async function fetchWmsTimes(service, layerName) {
    const xmlText = await fetchText(`${service}?service=WMS&version=1.3.0&request=GetCapabilities`);
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    const layers = Array.from(xml.getElementsByTagName("Layer"));
    const productLayer = layers.find((layer) => directChildText(layer, "Name") === layerName);
    if (!productLayer) return [];
    const dimension = Array.from(productLayer.children).find((child) => child.localName === "Dimension" && child.getAttribute("name") === "time");
    if (!dimension) return [];
    return dimension.textContent
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(-70);
  }

  function directChildText(element, localName) {
    const child = Array.from(element.children).find((node) => node.localName === localName);
    return child ? child.textContent.trim() : "";
  }

  function updateRadarControls() {
    const slider = $("#radarFrame");
    const hasFrames = state.radarFrames.length > 0;
    slider.max = String(Math.max(0, state.radarFrames.length - 1));
    slider.value = String(state.radarFrameIndex);
    slider.disabled = !hasFrames;
    $("#radarPrevBtn").disabled = !hasFrames;
    $("#radarNextBtn").disabled = !hasFrames;
    $("#radarPlayBtn").disabled = !hasFrames;
  }

  function applyRadarFrame() {
    const frame = state.radarFrames[state.radarFrameIndex];
    $("#radarFrame").value = String(state.radarFrameIndex);
    if (state.radarLayer && frame) {
      state.radarLayer.setParams({ time: frame }, false);
    }
    $("#radarFrameLabel").textContent = frame ? `${formatUtc(frame)} UTC` : "Latest server frame";
  }

  function stepRadar(direction) {
    if (!state.radarFrames.length) return;
    const next = state.radarFrameIndex + direction;
    state.radarFrameIndex = (next + state.radarFrames.length) % state.radarFrames.length;
    applyRadarFrame();
  }

  function toggleRadarLoop() {
    if (state.radarTimer) {
      stopRadarLoop();
      return;
    }
    if (!state.radarFrames.length) return;
    setButtonIcon($("#radarPlayBtn"), "pause");
    state.radarTimer = window.setInterval(() => stepRadar(1), 750);
  }

  function stopRadarLoop() {
    if (state.radarTimer) {
      window.clearInterval(state.radarTimer);
      state.radarTimer = null;
    }
    setButtonIcon($("#radarPlayBtn"), "play");
  }

  async function loadRadarSites() {
    try {
      const data = await apiJson(`${NOAA_WMS}/nws/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=nws:radar_sites&outputFormat=application/json`);
      const seen = new Set();
      state.radarSites = data.features
        .map((feature) => feature.properties)
        .filter((site) => site && site.rda_id)
        .filter((site) => /^K|^P|^TJUA$/i.test(site.rda_id))
        .filter((site) => {
          const id = site.rda_id.toUpperCase();
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .sort((a, b) => a.rda_id.localeCompare(b.rda_id));
      populateRadarSiteSelect();
      renderRadarSiteLayer();
    } catch (error) {
      console.error(error);
      showToast("Radar sites unavailable", "The NOAA radar-site catalog did not load.", { tone: "warn" });
    }
  }

  function populateRadarSiteSelect(filterText) {
    const select = $("#radarSite");
    const filter = (filterText || "").trim().toUpperCase();
    const previous = select.value;
    const matches = state.radarSites.filter((site) => {
      const label = `${site.rda_id} ${site.name || ""} ${site.wfo_id || ""}`.toUpperCase();
      return !filter || label.includes(filter);
    });

    select.innerHTML = matches.map((site) => {
      const city = site.name ? ` - ${site.name}` : "";
      return `<option value="${escapeHtml(site.rda_id.toLowerCase())}">${escapeHtml(site.rda_id)}${escapeHtml(city)}</option>`;
    }).join("");

    const preferred = matches.find((site) => site.rda_id === "KTLX") || matches[0];
    if (matches.some((site) => site.rda_id.toLowerCase() === previous)) {
      select.value = previous;
    } else if (preferred) {
      select.value = preferred.rda_id.toLowerCase();
    }
  }

  function renderRadarSiteLayer() {
    state.siteLayer.clearLayers();
    state.radarSites.forEach((site) => {
      const marker = L.circleMarker([site.lat, site.lon], {
        radius: 4,
        color: "#39bfd2",
        weight: 1,
        fillColor: "#10140f",
        fillOpacity: 0.9
      }).bindPopup(`<strong>${escapeHtml(site.rda_id)}</strong><br>${escapeHtml(site.name || "")}<br>WFO ${escapeHtml(site.wfo_id || "")}`);
      marker.on("click", () => {
        $("#radarProduct").value = "single_site";
        $("#singleSiteControls").hidden = false;
        $("#radarSite").value = site.rda_id.toLowerCase();
        updateRadarLayer(true);
      });
      state.siteLayer.addLayer(marker);
    });
  }

  function zoomToSelectedSite() {
    const id = $("#radarSite").value.toUpperCase();
    const site = state.radarSites.find((item) => item.rda_id === id);
    if (site) state.map.setView([site.lat, site.lon], Math.max(state.map.getZoom(), 7));
  }

  async function loadAlerts() {
    if (state.alertLoading) return;
    state.alertLoading = true;
    try {
      let data;
      try {
        data = await apiJson(`${NWS_API}/alerts/active?status=actual&message_type=alert`);
      } catch {
        data = await apiJson(`${NWS_API}/alerts/active`);
      }
      state.allAlerts = (data.features || []).sort(alertCompare);
      renderAlertLayer();
      renderAlerts();
      processAlertNotifications(state.allAlerts);
      setStatus("alertStatus", `Alerts: ${state.allAlerts.length} active`, "ok");
    } catch (error) {
      console.error(error);
      setStatus("alertStatus", "Alerts: feed error", "fail");
      showToast("NWS alert feed error", "Active alerts did not load from api.weather.gov.", { tone: "warn" });
    } finally {
      state.alertLoading = false;
    }
  }

  function renderAlertLayer() {
    state.alertLayer.clearLayers();
    const polygonAlerts = state.allAlerts.filter((feature) => feature.geometry);
    state.alertLayer.addData(polygonAlerts);
  }

  function bindAlertPopup(feature, layer) {
    const props = feature.properties || {};
    layer.bindPopup(`
      <div class="alert-popup">
        <h3>${escapeHtml(props.event || "NWS Alert")}</h3>
        <p>${escapeHtml(simpleAlertReport(props))}</p>
        <p><strong>Expires:</strong> ${escapeHtml(formatLocal(props.expires))}</p>
      </div>
    `);
  }

  function styleAlertFeature(feature) {
    const props = feature.properties || {};
    const color = alertColor(props);
    return {
      color,
      weight: isHighImpactAlert(feature) ? 3 : 2,
      opacity: 0.9,
      fillColor: color,
      fillOpacity: isHighImpactAlert(feature) ? 0.18 : 0.08
    };
  }

  function processAlertNotifications(features) {
    const ids = features.map(alertId).filter(Boolean);
    const unseen = features.filter((feature) => {
      const id = alertId(feature);
      return id && !state.seenAlertIds.has(id);
    });

    if (!state.alertFeedInitialized) {
      unseen
        .filter(isHighImpactAlert)
        .slice(0, 3)
        .forEach((feature) => showAlertToast(feature, "Current high-impact alert"));
      state.alertFeedInitialized = true;
    } else {
      unseen
        .filter(isHighImpactAlert)
        .slice(0, 8)
        .forEach((feature) => showAlertToast(feature, "New NWS alert"));
    }

    ids.forEach((id) => state.seenAlertIds.add(id));
    persistSeenAlerts();
  }

  function renderAlerts() {
    const filter = $("#alertFilter").value;
    const source = filter === "point" ? state.pointAlerts : state.allAlerts;
    const inBounds = $("#boundsFilter").checked;
    let visible = source.filter((feature) => {
      if (filter === "warnings") return /warning/i.test(feature.properties?.event || "");
      if (filter === "severe") return isHighImpactAlert(feature);
      return true;
    });
    if (inBounds) {
      const bounds = state.map.getBounds();
      visible = visible.filter((feature) => featureInBounds(feature, bounds));
    }

    const warnings = visible.filter((feature) => /warning/i.test(feature.properties?.event || "")).length;
    const high = visible.filter(isHighImpactAlert).length;
    $("#alertSummary").innerHTML = `
      <div class="summary-metric"><strong>${visible.length}</strong><span>shown</span></div>
      <div class="summary-metric"><strong>${warnings}</strong><span>warnings</span></div>
      <div class="summary-metric"><strong>${high}</strong><span>high impact</span></div>
    `;

    const list = $("#alertList");
    if (!visible.length) {
      list.innerHTML = `<div class="alert-item severity-unknown"><h3>No matching NWS alerts</h3><p>Feed checked ${escapeHtml(new Date().toLocaleTimeString())}.</p></div>`;
      return;
    }

    list.innerHTML = visible.slice(0, 120).map(alertCardHtml).join("");
  }

  function alertCardHtml(feature) {
    const props = feature.properties || {};
    const id = escapeHtml(alertId(feature));
    const severityClass = `severity-${(props.severity || "unknown").toLowerCase()}`;
    return `
      <article class="alert-item ${severityClass}" data-alert-id="${id}" style="border-left-color:${alertColor(props)}">
        <h3>${escapeHtml(props.event || "NWS Alert")}</h3>
        <div class="alert-meta">
          <span class="meta-chip">${escapeHtml(props.severity || "Unknown")}</span>
          <span class="meta-chip">${escapeHtml(props.urgency || "Unknown")}</span>
          <span class="meta-chip">${escapeHtml(formatLocal(props.expires))}</span>
        </div>
        <p>${escapeHtml(simpleAlertReport(props))}</p>
        <div class="alert-actions">
          <button class="text-button" data-action="detail">Detailed NWS report</button>
          <button class="text-button" data-action="zoom">Zoom</button>
        </div>
      </article>
    `;
  }

  function handleAlertListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = button.closest("[data-alert-id]");
    const feature = findAlertById(item.dataset.alertId);
    if (!feature) return;
    if (button.dataset.action === "detail") openAlertDialog(feature);
    if (button.dataset.action === "zoom") zoomToAlert(feature);
  }

  function showAlertToast(feature, label) {
    const props = feature.properties || {};
    const id = alertId(feature);
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.alertId = id;
    toast.style.borderLeftColor = alertColor(props);
    toast.innerHTML = `
      <h3>${escapeHtml(label)}: ${escapeHtml(props.event || "NWS Alert")}</h3>
      <p>${escapeHtml(simpleAlertReport(props))}</p>
      <div class="alert-actions">
        <button class="text-button" data-action="detail">Detailed NWS report</button>
        <button class="text-button" data-action="zoom">Zoom</button>
      </div>
    `;
    $("#toastRegion").prepend(toast);
    while ($("#toastRegion").children.length > 5) {
      $("#toastRegion").lastElementChild.remove();
    }
    window.setTimeout(() => toast.remove(), 22000);
    if (state.notifyEnabled) desktopNotify(feature);
    if (state.soundEnabled) playAlertTone();
  }

  function handleToastClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const toast = button.closest("[data-alert-id]");
    const feature = findAlertById(toast.dataset.alertId);
    if (!feature) return;
    if (button.dataset.action === "detail") openAlertDialog(feature);
    if (button.dataset.action === "zoom") zoomToAlert(feature);
  }

  function openAlertDialog(feature) {
    const props = feature.properties || {};
    $("#dialogTitle").textContent = props.headline || props.event || "NWS Alert";
    $("#dialogBody").innerHTML = `
      <div class="report-block">
        <h3>Simple Report</h3>
        <p>${escapeHtml(simpleAlertReport(props))}</p>
      </div>
      <div class="report-block">
        <h3>Detailed NWS Report</h3>
        <pre>${escapeHtml(props.description || "No description supplied.")}</pre>
      </div>
      <div class="report-block">
        <h3>Instructions</h3>
        <pre>${escapeHtml(props.instruction || "No instruction supplied.")}</pre>
      </div>
      <div class="report-block">
        <h3>Metadata</h3>
        <p>${escapeHtml(alertMetadata(props))}</p>
      </div>
      <div class="report-block">
        <h3>NWS Parameters</h3>
        <pre>${escapeHtml(formatParameters(props.parameters))}</pre>
      </div>
    `;
    const dialog = $("#alertDialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function zoomToAlert(feature) {
    if (!feature.geometry) return;
    const layer = L.geoJSON(feature);
    const bounds = layer.getBounds();
    if (bounds.isValid()) state.map.fitBounds(bounds.pad(0.25));
  }

  function findAlertById(id) {
    return [...state.allAlerts, ...state.pointAlerts].find((feature) => alertId(feature) === id);
  }

  function simpleAlertReport(props) {
    const event = props.event || "Alert";
    const area = props.areaDesc ? `for ${props.areaDesc}` : "";
    const until = props.expires ? `until ${formatLocal(props.expires)}` : "";
    const headline = props.headline || "";
    return [event, area, until, headline].filter(Boolean).join(" ");
  }

  function alertMetadata(props) {
    return [
      `Severity: ${props.severity || "Unknown"}`,
      `Urgency: ${props.urgency || "Unknown"}`,
      `Certainty: ${props.certainty || "Unknown"}`,
      `Sent: ${formatLocal(props.sent)}`,
      `Effective: ${formatLocal(props.effective)}`,
      `Expires: ${formatLocal(props.expires)}`
    ].join("\n");
  }

  function formatParameters(parameters) {
    if (!parameters || !Object.keys(parameters).length) return "No additional parameters.";
    return Object.entries(parameters)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join("\n");
  }

  async function loadPointWeather(lat, lon) {
    setStatus("forecastStatus", "Forecast: loading", "warn");
    state.selectedPoint = { lat, lon };
    if (state.selectedMarker) state.map.removeLayer(state.selectedMarker);
    state.selectedMarker = L.marker([lat, lon]).addTo(state.map);
    state.selectedMarker.bindPopup(`Forecast point<br>${lat.toFixed(4)}, ${lon.toFixed(4)}`).openPopup();
    state.map.setView([lat, lon], Math.max(state.map.getZoom(), 7));
    $("#pointReadout").textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

    try {
      const point = await apiJson(`${NWS_API}/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
      const props = point.properties;
      $("#pointReadout").textContent = `${props.relativeLocation?.properties?.city || "Selected point"}, ${props.relativeLocation?.properties?.state || ""} (${lat.toFixed(4)}, ${lon.toFixed(4)})`;

      const [forecast, hourly, stations, pointAlerts] = await Promise.allSettled([
        apiJson(props.forecast),
        apiJson(props.forecastHourly),
        apiJson(props.observationStations),
        apiJson(`${NWS_API}/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`)
      ]);

      if (forecast.status === "fulfilled") renderForecast(forecast.value);
      if (hourly.status === "fulfilled") renderHourly(hourly.value);
      if (stations.status === "fulfilled") loadCurrentObservation(stations.value);
      if (pointAlerts.status === "fulfilled") {
        state.pointAlerts = (pointAlerts.value.features || []).sort(alertCompare);
        if ($("#alertFilter").value === "point") renderAlerts();
      }

      setStatus("forecastStatus", "Forecast: loaded", "ok");
      activateTab("forecast");
    } catch (error) {
      console.error(error);
      setStatus("forecastStatus", "Forecast: error", "fail");
      showToast("Forecast error", "NWS point forecast did not load for that location.", { tone: "warn" });
    }
  }

  async function loadCurrentObservation(stations) {
    const firstStation = stations.features?.[0];
    if (!firstStation?.id) return;
    try {
      const obs = await apiJson(`${firstStation.id}/observations/latest`);
      renderCurrentConditions(obs, firstStation.properties || {});
    } catch (error) {
      console.warn("Observation load failed", error);
    }
  }

  function renderCurrentConditions(obs, station) {
    const props = obs.properties || {};
    const temp = props.temperature?.value;
    const wind = props.windSpeed?.value;
    const gust = props.windGust?.value;
    const dewpoint = props.dewpoint?.value;
    const text = props.textDescription || "Observation";

    $("#currentConditions").innerHTML = `
      <div class="current-grid">
        <div class="current-tile"><span>Station</span><strong>${escapeHtml(station.stationIdentifier || station.name || "NWS")}</strong></div>
        <div class="current-tile"><span>Conditions</span><strong>${escapeHtml(text)}</strong></div>
        <div class="current-tile"><span>Temperature</span><strong>${formatTemp(temp)}</strong></div>
        <div class="current-tile"><span>Dewpoint</span><strong>${formatTemp(dewpoint)}</strong></div>
        <div class="current-tile"><span>Wind</span><strong>${formatSpeed(wind)}</strong></div>
        <div class="current-tile"><span>Gust</span><strong>${formatSpeed(gust)}</strong></div>
      </div>
    `;
  }

  function renderForecast(forecast) {
    const periods = forecast.properties?.periods || [];
    $("#forecastList").innerHTML = periods.slice(0, 10).map((period) => `
      <article class="forecast-item">
        <h3>${escapeHtml(period.name)}</h3>
        <div class="forecast-meta">
          <span class="meta-chip">${escapeHtml(String(period.temperature))} ${escapeHtml(period.temperatureUnit)}</span>
          <span class="meta-chip">${escapeHtml(period.windSpeed || "")} ${escapeHtml(period.windDirection || "")}</span>
        </div>
        <p>${escapeHtml(period.detailedForecast || period.shortForecast || "")}</p>
      </article>
    `).join("");
  }

  function renderHourly(hourly) {
    if (!window.Chart) return;
    const periods = (hourly.properties?.periods || []).slice(0, 30);
    const labels = periods.map((period) => new Date(period.startTime).toLocaleTimeString([], { hour: "numeric" }));
    const temps = periods.map((period) => period.temperature);
    const pops = periods.map((period) => period.probabilityOfPrecipitation?.value ?? null);
    const ctx = $("#hourlyChart");
    if (state.hourlyChart) state.hourlyChart.destroy();
    state.hourlyChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Temp F",
            data: temps,
            borderColor: "#ffc857",
            backgroundColor: "rgba(255, 200, 87, 0.12)",
            pointRadius: 2,
            tension: 0.25,
            yAxisID: "y"
          },
          {
            label: "PoP %",
            data: pops,
            borderColor: "#39bfd2",
            backgroundColor: "rgba(57, 191, 210, 0.10)",
            pointRadius: 2,
            tension: 0.25,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: "#d7ddce" } }
        },
        scales: {
          x: { ticks: { color: "#aab3a2", maxRotation: 0 }, grid: { color: "rgba(170,179,162,0.12)" } },
          y: { ticks: { color: "#ffc857" }, grid: { color: "rgba(170,179,162,0.12)" } },
          y1: { position: "right", ticks: { color: "#39bfd2" }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  async function toggleOutlook(id, enabled) {
    if (!OUTLOOKS[id]) return;
    if (!enabled) {
      if (state.outlookLayers[id]) state.map.removeLayer(state.outlookLayers[id]);
      return;
    }
    try {
      if (!state.outlookLayers[id]) {
        const data = await apiJson(OUTLOOKS[id].url);
        state.outlookLayers[id] = L.geoJSON(data, {
          style: styleOutlook,
          onEachFeature: (feature, layer) => {
            const props = feature.properties || {};
            layer.bindPopup(`<strong>${escapeHtml(OUTLOOKS[id].label)}</strong><br>${escapeHtml(props.LABEL2 || props.LABEL || "Outlook")}<br>Valid ${escapeHtml(formatSpcTime(props.VALID_ISO))}`);
          }
        });
      }
      state.outlookLayers[id].addTo(state.map);
    } catch (error) {
      console.error(error);
      showToast("SPC outlook error", `${OUTLOOKS[id].label} did not load.`, { tone: "warn" });
      const checkbox = $(`[data-outlook="${id}"]`);
      if (checkbox) checkbox.checked = false;
    }
  }

  async function refreshEnabledOutlooks() {
    Object.values(state.outlookLayers).forEach((layer) => state.map.removeLayer(layer));
    state.outlookLayers = {};
    const enabled = $$("[data-outlook]").filter((checkbox) => checkbox.checked);
    await Promise.allSettled(enabled.map((checkbox) => toggleOutlook(checkbox.dataset.outlook, true)));
  }

  function styleOutlook(feature) {
    const props = feature.properties || {};
    return {
      color: props.stroke || "#ffc857",
      weight: 2,
      opacity: 0.92,
      fillColor: props.fill || props.stroke || "#ffc857",
      fillOpacity: 0.23
    };
  }

  function setupGuidance() {
    setGuidance("day1");
  }

  async function setGuidance(id) {
    const guide = GUIDANCE[id] || GUIDANCE.day1;
    $("#guidanceLink").href = guide.href;
    $("#guidanceImage").src = `${guide.fallback}?t=${Date.now()}`;
    $$(".guidance-button").forEach((button) => button.classList.toggle("is-active", button.dataset.guidance === id));
    try {
      const html = await fetchText(guide.href);
      const match = html.match(/show_tab\('otlk_(\d{4})'\)/);
      if (match) {
        $("#guidanceImage").src = `${SPC_OUTLOOK}/${guide.prefix}otlk_${match[1]}.png?t=${Date.now()}`;
      }
    } catch (error) {
      console.warn("SPC guidance image discovery failed", error);
    }
  }

  async function loadNhc() {
    try {
      const data = await apiJson("https://www.nhc.noaa.gov/CurrentStorms.json");
      const storms = data.activeStorms || data.storms || [];
      if (!storms.length) {
        $("#nhcBox").textContent = "NHC: no active tropical cyclones listed.";
        return;
      }
      $("#nhcBox").innerHTML = `<strong>NHC active storms</strong>${storms.map((storm) => `
        <div class="nhc-storm">
          <strong>${escapeHtml(storm.name || storm.id || "Storm")}</strong><br>
          ${escapeHtml(storm.classification || storm.stormType || "")}
          ${escapeHtml(storm.intensity || storm.intensityDescription || "")}
        </div>
      `).join("")}`;
    } catch {
      $("#nhcBox").textContent = "NHC storm list unavailable.";
    }
  }

  function activateTab(id) {
    $$(".tab-button").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === id));
    $$(".tab-panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === `${id}Panel`));
  }

  function cycleBaseLayer() {
    state.map.removeLayer(state.baseLayers[state.activeBase].layer);
    state.activeBase = (state.activeBase + 1) % state.baseLayers.length;
    state.baseLayers[state.activeBase].layer.addTo(state.map);
    showToast("Base map", state.baseLayers[state.activeBase].label, { tone: "info", timeout: 1800 });
  }

  function toggleRadarVisibility() {
    state.radarVisible = !state.radarVisible;
    const button = $("#radarToggleBtn");
    button.classList.toggle("is-active", state.radarVisible);
    button.setAttribute("aria-pressed", String(state.radarVisible));
    if (!state.radarLayer) return;
    if (state.radarVisible) state.radarLayer.addTo(state.map);
    else state.map.removeLayer(state.radarLayer);
  }

  function toggleAlertLayerVisibility() {
    state.alertLayerVisible = !state.alertLayerVisible;
    const button = $("#alertLayerBtn");
    button.classList.toggle("is-active", state.alertLayerVisible);
    button.setAttribute("aria-pressed", String(state.alertLayerVisible));
    if (state.alertLayerVisible) state.alertLayer.addTo(state.map);
    else state.map.removeLayer(state.alertLayer);
  }

  function fitConus() {
    state.map.fitBounds([[24.2, -125.2], [49.7, -66.4]]);
  }

  function clearPoint() {
    state.selectedPoint = null;
    state.pointAlerts = [];
    if (state.selectedMarker) {
      state.map.removeLayer(state.selectedMarker);
      state.selectedMarker = null;
    }
    $("#pointReadout").textContent = "No forecast point selected";
    $("#currentConditions").innerHTML = `<span class="muted">Select a point for NWS forecast and observations.</span>`;
    $("#forecastList").innerHTML = "";
    if (state.hourlyChart) state.hourlyChart.destroy();
    if ($("#alertFilter").value === "point") renderAlerts();
    setStatus("forecastStatus", "Forecast: idle", "");
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      showToast("Location unavailable", "This browser does not expose geolocation.", { tone: "warn" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        $("#latInput").value = lat.toFixed(4);
        $("#lonInput").value = lon.toFixed(4);
        loadPointWeather(lat, lon);
      },
      () => showToast("Location blocked", "Browser location permission was not granted.", { tone: "warn" }),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  async function requestDesktopNotifications() {
    if (!("Notification" in window)) {
      showToast("Desktop alerts", "Browser notifications are not supported here.", { tone: "warn" });
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    state.notifyEnabled = permission === "granted";
    $("#notifyBtn").setAttribute("aria-pressed", String(state.notifyEnabled));
    showToast("Desktop alerts", state.notifyEnabled ? "Enabled for new high-impact NWS alerts." : "Not enabled.", { tone: state.notifyEnabled ? "info" : "warn" });
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    $("#soundBtn").setAttribute("aria-pressed", String(state.soundEnabled));
    if (state.soundEnabled) playAlertTone(true);
  }

  function playAlertTone(shortTone) {
    try {
      state.audioContext = state.audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = state.audioContext;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (shortTone ? 0.18 : 0.55));
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + (shortTone ? 0.2 : 0.6));
    } catch (error) {
      console.warn("Audio tone failed", error);
    }
  }

  function desktopNotify(feature) {
    if (!state.notifyEnabled || Notification.permission !== "granted") return;
    const props = feature.properties || {};
    const notification = new Notification(props.event || "NWS Alert", {
      body: simpleAlertReport(props),
      tag: alertId(feature),
      requireInteraction: /Tornado Warning|Extreme Wind Warning/i.test(props.event || "")
    });
    notification.onclick = () => {
      window.focus();
      openAlertDialog(feature);
    };
  }

  function annotateDrawnLayer(layer) {
    if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
      const latlngs = layer.getLatLngs();
      const miles = lineDistanceMiles(latlngs);
      layer.bindPopup(`Distance: ${miles.toFixed(1)} mi`).openPopup();
    } else if (layer instanceof L.Polygon) {
      const latlngs = layer.getLatLngs()[0] || [];
      const areaSqMi = polygonAreaSqMi(latlngs);
      layer.bindPopup(`Area: ${areaSqMi.toFixed(1)} sq mi`).openPopup();
    } else if (layer instanceof L.Marker) {
      const pos = layer.getLatLng();
      layer.bindPopup(`${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`).openPopup();
    }
  }

  function lineDistanceMiles(latlngs) {
    let meters = 0;
    for (let i = 1; i < latlngs.length; i += 1) {
      meters += state.map.distance(latlngs[i - 1], latlngs[i]);
    }
    return meters / 1609.344;
  }

  function polygonAreaSqMi(latlngs) {
    if (L.GeometryUtil && L.GeometryUtil.geodesicArea) {
      return L.GeometryUtil.geodesicArea(latlngs) / 2589988.110336;
    }
    return 0;
  }

  function alertCompare(a, b) {
    return alertScore(b) - alertScore(a);
  }

  function alertScore(feature) {
    const props = feature.properties || {};
    const event = props.event || "";
    let score = 0;
    if (/Tornado Warning/i.test(event)) score += 1000;
    else if (/Extreme Wind Warning/i.test(event)) score += 900;
    else if (/Severe Thunderstorm Warning/i.test(event)) score += 800;
    else if (/Flash Flood Warning/i.test(event)) score += 780;
    else if (/Warning/i.test(event)) score += 650;
    else if (/Watch/i.test(event)) score += 420;
    if (props.severity === "Extreme") score += 80;
    if (props.severity === "Severe") score += 60;
    const sent = Date.parse(props.sent || props.effective || 0);
    if (Number.isFinite(sent)) score += Math.max(0, 50 - ((Date.now() - sent) / 3600000));
    return score;
  }

  function isHighImpactAlert(feature) {
    const props = feature.properties || {};
    const event = props.event || "";
    return HIGH_IMPACT_EVENTS.some((name) => event.includes(name)) || props.severity === "Extreme" || props.severity === "Severe";
  }

  function alertColor(props) {
    return ALERT_COLORS[props.event] || (props.severity === "Extreme" ? "#d96dff" : props.severity === "Severe" ? "#ff4f5e" : props.severity === "Moderate" ? "#ff8c42" : "#39bfd2");
  }

  function alertId(feature) {
    return feature.id || feature.properties?.id || feature.properties?.["@id"] || feature.properties?.event + feature.properties?.sent;
  }

  function featureInBounds(feature, bounds) {
    if (!feature.geometry) return false;
    const coordinates = [];
    collectCoordinates(feature.geometry.coordinates, coordinates);
    return coordinates.some(([lon, lat]) => bounds.contains([lat, lon]));
  }

  function collectCoordinates(value, output) {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      output.push(value);
      return;
    }
    value.forEach((child) => collectCoordinates(child, output));
  }

  function showToast(title, message, options) {
    const opts = options || {};
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.style.borderLeftColor = opts.tone === "warn" ? "#ffc857" : opts.tone === "info" ? "#39bfd2" : "#ff4f5e";
    toast.innerHTML = `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>`;
    $("#toastRegion").prepend(toast);
    window.setTimeout(() => toast.remove(), opts.timeout || 4800);
  }

  function setStatus(id, text, statusClass) {
    const element = $(`#${id}`);
    element.textContent = text;
    element.classList.remove("ok", "warn", "fail");
    if (statusClass) element.classList.add(statusClass);
  }

  function setButtonIcon(button, iconName) {
    button.innerHTML = `<i data-lucide="${iconName}"></i>`;
    initStaticIcons();
  }

  async function apiJson(url) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/geo+json, application/json, application/ld+json, */*"
      },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.text();
  }

  function restoreSeenAlerts() {
    try {
      const saved = JSON.parse(sessionStorage.getItem("stormCommandSeenAlerts") || "[]");
      state.seenAlertIds = new Set(saved);
    } catch {
      state.seenAlertIds = new Set();
    }
  }

  function persistSeenAlerts() {
    try {
      const ids = Array.from(state.seenAlertIds).slice(-1500);
      sessionStorage.setItem("stormCommandSeenAlerts", JSON.stringify(ids));
    } catch {
      /* session storage can be unavailable in private contexts */
    }
  }

  function formatUtc(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toISOString().slice(11, 19);
  }

  function formatLocal(value) {
    if (!value) return "unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatSpcTime(value) {
    return value ? formatLocal(value) : "current";
  }

  function formatTemp(celsius) {
    if (celsius === null || celsius === undefined || Number.isNaN(Number(celsius))) return "Missing";
    return `${Math.round((Number(celsius) * 9) / 5 + 32)} F`;
  }

  function formatSpeed(mps) {
    if (mps === null || mps === undefined || Number.isNaN(Number(mps))) return "Missing";
    return `${Math.round(Number(mps) * 2.23694)} mph`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
