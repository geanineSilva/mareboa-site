/*
  Condição de pesca ao vivo para as páginas dos pontos.
  Mesmas regras do app (services/conditions.py), com dados da Open-Meteo.
  Não é previsão de captura: é uma nota pelo tempo, mar e horário.
*/
(function () {
  var RULES = {
    base: 80,
    wind: [[12, 5, "ok", "Vento fraco"], [20, -5, "warn", "Vento moderado"],
           [30, -25, "bad", "Vento forte"], [999, -45, "bad", "Vento muito forte"]],
    gustBad: 40, gustDanger: 55,
    waveOpen: [[0.8, 5, "ok", "Mar calmo"], [1.2, -5, "warn", "Ondas moderadas"],
               [1.8, -25, "bad", "Mar mexido"], [99, -45, "bad", "Mar agitado"]],
    waveRockDanger: 1.5,
    rain: [[0.1, 3, "ok", "Sem chuva"], [1.0, -8, "warn", "Garoa"],
           [4.0, -20, "bad", "Chuva"], [999, -35, "bad", "Chuva forte"]],
    tideTurn: 8, tideRising: 5, light: 7, night: 20, nightCap: 70,
    levels: [[75, "bom"], [55, "razoavel"], [0, "ruim"]],
    waterWeights: [[24, 1.0], [48, 0.6], [72, 0.3]],
    waterLimits: { doce: [6, 20], abrigado: [6, 20], mar_aberto: [12, 35] }
  };
  var RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
  var LEVEL_TEXT = { bom: "Bom", razoavel: "Razoável", ruim: "Fraco", evite: "Evite" };

  function fmt(n, dec) {
    if (n === null || n === undefined) return "—";
    return Number(n).toFixed(dec || 0).replace(".", ",");
  }
  function lower1(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function parse(t) { return new Date(t + ":00"); } // horário local de SP vindo da API
  function hours(a, b) { return (a - b) / 3600000; }

  function kindOf(tipo) {
    if (tipo === "rio") return { kind: "doce", rock: false };
    if (tipo === "praia") return { kind: "mar_aberto", rock: false };
    if (tipo === "costao") return { kind: "mar_aberto", rock: true };
    return { kind: "abrigado", rock: false };
  }

  function tideMarks(list) {
    var lv = list.map(function (h) { return h.sea; });
    var marks = lv.map(function (cur, i) {
      var prev = i > 0 ? lv[i - 1] : null, nxt = i + 1 < lv.length ? lv[i + 1] : null;
      if (cur === null || (prev === null && nxt === null)) return null;
      if (prev !== null && nxt !== null && ((cur >= prev && cur >= nxt) || (cur <= prev && cur <= nxt))) return "virada";
      var ref = nxt !== null ? nxt - cur : cur - prev;
      return ref > 0 ? "enchendo" : "vazando";
    });
    var near = marks.slice();
    marks.forEach(function (m, i) {
      if (m === "virada") [i - 1, i + 1].forEach(function (j) {
        if (j >= 0 && j < marks.length && marks[j] !== "virada") near[j] = "perto_virada";
      });
    });
    return near;
  }

  function evaluate(h, k, mark, sun) {
    var score = RULES.base, reasons = [], danger = false, i, r;
    if (h.wind !== null) {
      for (i = 0; i < RULES.wind.length; i++) {
        r = RULES.wind[i];
        if (h.wind <= r[0]) {
          score += r[1];
          var txt = r[3] + " (" + fmt(h.wind) + " km/h";
          if (h.gust !== null && h.gust >= 25) txt += ", rajadas de " + fmt(h.gust);
          reasons.push([r[2], txt + ")"]);
          break;
        }
      }
    }
    if (h.gust !== null && h.gust >= RULES.gustDanger) { danger = true; reasons.push(["bad", "Rajadas perigosas (" + fmt(h.gust) + " km/h)"]); }
    else if (h.gust !== null && h.gust >= RULES.gustBad) score -= 15;

    if (h.code !== null && h.code >= 95) { danger = true; reasons.push(["bad", "Trovoada prevista"]); }
    else if ((h.rain === null || h.rain < 0.1) && h.code !== null && RAIN_CODES.indexOf(h.code) >= 0) {
      score += RULES.rain[1][1]; reasons.push(["warn", "Chuva fraca"]);
    } else if (h.rain !== null) {
      for (i = 0; i < RULES.rain.length; i++) {
        r = RULES.rain[i];
        if (h.rain < r[0] || r[0] === 999) {
          score += r[1];
          reasons.push([r[2], r[2] === "ok" ? r[3] : r[3] + " (" + fmt(h.rain, 1) + " mm/h)"]);
          break;
        }
      }
    }
    if (k.kind === "mar_aberto" && h.wave !== null) {
      for (i = 0; i < RULES.waveOpen.length; i++) {
        r = RULES.waveOpen[i];
        if (h.wave <= r[0]) { score += r[1]; reasons.push([r[2], r[3] + " (ondas de " + fmt(h.wave, 1) + " m)"]); break; }
      }
      if (k.rock && h.wave > RULES.waveRockDanger) { danger = true; reasons.push(["bad", "Costão com mar forte: risco de onda nas pedras"]); }
    }
    if (k.kind !== "doce" && mark) {
      if (mark === "virada" || mark === "perto_virada") { score += RULES.tideTurn; reasons.push(["ok", "Virada de maré"]); }
      else if (mark === "enchendo") { score += RULES.tideRising; reasons.push(["ok", "Maré enchendo"]); }
      else reasons.push(["info", "Maré vazando"]);
    }
    var dark = false;
    if (sun) {
      var t = h.time, sr = sun[0], ss = sun[1], m = 60000;
      if (t >= sr - 30 * m && t <= sr.getTime() + 90 * m) { score += RULES.light; reasons.push(["ok", "Amanhecer"]); }
      else if (t >= ss - 120 * m && t <= ss.getTime() + 15 * m) { score += RULES.light; reasons.push(["ok", "Fim de tarde"]); }
      else if (t < sr - 30 * m || t > ss.getTime() + 30 * m) { score -= RULES.night; dark = true; reasons.push(["warn", "Já escuro: mais risco em lugar desconhecido"]); }
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    if (dark) score = Math.min(score, RULES.nightCap);
    var level = danger ? "evite" : RULES.levels.filter(function (l) { return score >= l[0]; })[0][1];
    return { time: h.time, score: score, level: level, reasons: reasons, raw: h };
  }

  function water(list, now, kind) {
    var past = list.filter(function (h) { return h.time <= now && hours(now, h.time) <= 72; });
    if (past.length < 48) return null;
    var total = 0, last24 = 0, weighted = 0;
    past.forEach(function (h) {
      var rain = h.rain || 0, age = hours(now, h.time);
      var w = RULES.waterWeights.filter(function (x) { return age <= x[0]; })[0][1];
      total += rain; weighted += rain * w; if (age <= 24) last24 += rain;
    });
    var lim = RULES.waterLimits[kind] || RULES.waterLimits.abrigado, level, title;
    if (weighted >= lim[1]) { level = "suja"; title = "Água provavelmente suja"; }
    else if (weighted >= lim[0]) { level = "turva"; title = "Água pode estar turva"; }
    else { level = "limpa"; title = "Água deve estar limpa"; }
    var detail = total < 1 ? "Quase sem chuva nos últimos 3 dias." :
      "Choveu " + fmt(total) + " mm nos últimos 3 dias" + (last24 >= 1 ? " (" + fmt(last24) + " mm nas últimas 24 h)." : ", mas nada nas últimas 24 h.");
    return { level: level, title: title, detail: detail };
  }

  function summarize(list, sunByDay, current, k, now) {
    var marks = tideMarks(list);
    var start = new Date(now); start.setMinutes(0, 0, 0);
    var ev = [];
    list.forEach(function (h, i) {
      var t = h.time;
      if (t < start || hours(t, start) >= 20) return;
      if ((t.getHours() < 5 || t.getHours() > 21) && t.getTime() !== start.getTime()) return;
      if (t.getTime() === start.getTime() && current) {
        h = Object.assign({}, h);
        if (current.rain !== null) h.rain = Math.round(current.rain * 40) / 10;
        ["code", "wind", "gust"].forEach(function (key) { if (current[key] !== null) h[key] = current[key]; });
      }
      ev.push(evaluate(h, k, marks[i], sunByDay[dayKey(t)]));
    });
    if (!ev.length) return null;
    var cur = ev[0], windows = [], w = [];
    ev.forEach(function (e) { if (e.level === "bom") w.push(e); else { if (w.length) windows.push(w); w = []; } });
    if (w.length) windows.push(w);
    var best = null, bestAvg = -1;
    windows.forEach(function (win) {
      var avg = win.reduce(function (s, x) { return s + x.score; }, 0) / win.length;
      if (avg > bestAvg) { bestAvg = avg; best = win; }
    });
    function fromLabel(t) { return (sameDay(t, now) ? "a partir das " : "amanhã a partir das ") + t.getHours() + "h"; }
    var headline, status;
    if (cur.level === "evite") {
      var bad = cur.reasons.filter(function (r) { return r[0] === "bad"; })[0];
      headline = "Evite agora: " + lower1(bad ? bad[1] : "condições perigosas"); status = "evite";
    } else if (cur.level === "bom") {
      var end = best && best[0] === cur ? new Date(best[best.length - 1].time.getTime() + 3600000) : null;
      headline = "Bom agora" + (end && end.getHours() !== (cur.time.getHours() + 1) % 24 ? ", até umas " + end.getHours() + "h" : ""); status = "bom";
    } else if (best) {
      headline = "Melhora " + fromLabel(best[0].time); status = "melhora";
    } else {
      var daylight = ev.filter(function (e) { return !e.reasons.some(function (r) { return r[1].indexOf("Já escuro") === 0; }); });
      var pool = daylight.length ? daylight : ev, count = {}, worst = null, max = 0;
      pool.forEach(function (e) { e.reasons.forEach(function (r) { if (r[0] === "bad") { var key = r[1].split(" (")[0]; count[key] = (count[key] || 0) + 1; if (count[key] > max) { max = count[key]; worst = key; } } }); });
      var onlyTomorrow = daylight.length && daylight.every(function (e) { return !sameDay(e.time, now); });
      headline = "Condições fracas " + (onlyTomorrow ? "amanhã" : "hoje") + (worst ? ": " + lower1(worst) : ""); status = "fraco";
    }
    return { now: cur, hours: ev, best: best, headline: headline, status: status, water: water(list, now, k.kind) };
  }

  function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function sameDay(a, b) { return dayKey(a) === dayKey(b); }
  function num(v) { return v === undefined || v === null ? null : Number(v); }

  function nowInSaoPaulo() {
    // relógio de SP, no mesmo formato "local" que a API devolve
    var p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    var g = {}; p.forEach(function (x) { g[x.type] = x.value; });
    return new Date(g.year + "-" + g.month + "-" + g.day + "T" + g.hour + ":" + g.minute + ":00");
  }

  function load(lat, lon) {
    var base = "latitude=" + lat + "&longitude=" + lon + "&timezone=America%2FSao_Paulo&forecast_days=2";
    var wUrl = "https://api.open-meteo.com/v1/forecast?" + base + "&past_days=3" +
      "&hourly=wind_speed_10m,wind_gusts_10m,precipitation,weather_code&daily=sunrise,sunset" +
      "&current=precipitation,weather_code,wind_speed_10m,wind_gusts_10m";
    var mUrl = "https://marine-api.open-meteo.com/v1/marine?" + base + "&past_days=3" +
      "&hourly=wave_height,sea_level_height_msl&cell_selection=sea";
    return Promise.all([
      fetch(wUrl).then(function (r) { if (!r.ok) throw new Error("clima"); return r.json(); }),
      fetch(mUrl).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    ]).then(function (res) {
      var w = res[0], m = res[1] || {}, wh = w.hourly || {}, mh = m.hourly || {}, mIdx = {};
      (mh.time || []).forEach(function (t, i) { mIdx[t] = i; });
      var list = (wh.time || []).map(function (t, i) {
        var j = mIdx[t];
        return { time: parse(t), wind: num(wh.wind_speed_10m[i]), gust: num(wh.wind_gusts_10m[i]),
          rain: num(wh.precipitation[i]), code: num(wh.weather_code[i]),
          wave: j === undefined ? null : num(mh.wave_height[j]), sea: j === undefined ? null : num(mh.sea_level_height_msl[j]) };
      });
      var sun = {};
      ((w.daily || {}).time || []).forEach(function (d, i) {
        var sr = parse(w.daily.sunrise[i]), ss = parse(w.daily.sunset[i]); sun[dayKey(sr)] = [sr, ss];
      });
      var c = w.current, now = nowInSaoPaulo(), current = null;
      if (c && c.time && Math.abs(hours(parse(c.time), now)) <= 0.75) {
        current = { rain: num(c.precipitation), code: num(c.weather_code), wind: num(c.wind_speed_10m), gust: num(c.wind_gusts_10m) };
      }
      return { list: list, sun: sun, current: current, now: now };
    });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function render(el, s) {
    var n = s.now;
    var reasons = n.reasons.filter(function (r) { return r[0] !== "info" || /Maré/.test(r[1]); }).slice(0, 4)
      .map(function (r) { return '<li class="r-' + r[0] + '">' + esc(r[1]) + "</li>"; }).join("");
    var strip = s.hours.slice(0, 6).map(function (e) {
      return '<div><span>' + e.time.getHours() + 'h</span><b class="lv-' + e.level + '">' + e.score + "</b></div>";
    }).join("");
    var waterHtml = s.water ? '<div class="water w-' + s.water.level + '"><strong>' + esc(s.water.title) + "</strong><span>" + esc(s.water.detail) + " Estimativa pela chuva.</span></div>" : "";
    el.innerHTML =
      '<div class="live-top"><div class="score lv-' + n.level + '"><b>' + n.score + "</b><small>nota</small></div>" +
      '<div><span class="tag lv-' + n.level + '">' + LEVEL_TEXT[n.level] + "</span><h3>" + esc(s.headline) + "</h3></div></div>" +
      '<div class="live-grid"><div><p class="label">Agora</p><ul class="reasons">' + reasons + "</ul></div>" +
      '<div><p class="label">Próximas horas</p><div class="strip">' + strip + "</div></div></div>" + waterHtml +
      '<p class="src">Nota do Maré Boa pelo vento, chuva, ondas, maré e horário. Dados: Open-Meteo. Não é previsão de captura.</p>';
  }

  window.MareBoa = {
    mostrar: function (el, lat, lon, tipo) {
      load(lat, lon).then(function (d) {
        var s = summarize(d.list, d.sun, d.current, kindOf(tipo), d.now);
        if (!s) throw new Error("sem dados");
        render(el, s);
      }).catch(function () {
        el.innerHTML = '<p class="src">Não foi possível carregar a previsão agora. Tente de novo em alguns minutos.</p>';
      });
    },
    peixesDoMes: function (el, porMes) {
      var mes = nowInSaoPaulo().getMonth() + 1, lista = (porMes[mes] || "").split(";").map(function (x) { return x.trim(); }).filter(Boolean);
      var nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
      el.innerHTML = "<p>O que costuma sair em " + nomes[mes - 1] + ":</p>" + lista.map(function (p) { return '<span class="chip">' + esc(p) + "</span>"; }).join("");
    }
  };
})();
